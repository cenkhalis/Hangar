// Command simulate writes synthetic flight log files for development and end-to-end tests.
//
//	go run ./cmd/simulate -serial AC-00001 -count 5 -out ../var/flight-logs/inbox
package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/cenkhalis/hangar/ingest/internal/simulate"
)

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "simulate:", err)
		os.Exit(1)
	}
}

func run(args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("simulate", flag.ContinueOnError)
	serial := fs.String("serial", "", "aircraft serial number (required)")
	out := fs.String("out", ".", "output directory")
	format := fs.String("format", "csv", "csv or json")
	count := fs.Int("count", 1, "number of flights")
	startRaw := fs.String("start", "", "first flight start, RFC 3339 (default: count*gap ago)")
	gap := fs.Duration("gap", 2*time.Hour, "time between flight starts")
	cruise := fs.Duration("cruise", 20*time.Minute, "cruise duration per flight")
	interval := fs.Duration("interval", time.Second, "sample interval")
	altitude := fs.Float64("altitude", 100, "cruise altitude above ground (m)")
	speed := fs.Float64("speed", 14, "cruise speed (m/s)")
	lat := fs.Float64("lat", 41.0151, "home latitude")
	lon := fs.Float64("lon", 28.9795, "home longitude")
	inAir := fs.Bool("in-air", false, "include the optional in_air column/field")
	seed := fs.Uint64("seed", 1, "random seed (flight i uses seed+i)")
	if err := fs.Parse(args); err != nil {
		return err
	}

	if *serial == "" {
		return errors.New("-serial is required")
	}
	if *format != "csv" && *format != "json" {
		return fmt.Errorf("-format must be csv or json, got %q", *format)
	}
	if *count < 1 {
		return errors.New("-count must be at least 1")
	}
	start := time.Now().UTC().Add(-time.Duration(*count) * *gap).Truncate(time.Minute)
	if *startRaw != "" {
		parsed, err := time.Parse(time.RFC3339, *startRaw)
		if err != nil {
			return fmt.Errorf("-start: %w", err)
		}
		start = parsed.UTC()
	}
	if err := os.MkdirAll(*out, 0o755); err != nil {
		return err
	}

	for i := range *count {
		cfg := simulate.DefaultConfig(*serial, start.Add(time.Duration(i)**gap))
		cfg.CruiseDuration = *cruise
		cfg.SampleInterval = *interval
		cfg.CruiseAltitudeM = *altitude
		cfg.CruiseSpeedMPS = *speed
		cfg.Home.Lat, cfg.Home.Lon = *lat, *lon
		cfg.IncludeInAir = *inAir
		cfg.Seed = *seed + uint64(i)

		name := fmt.Sprintf("%s_%s.%s", *serial, cfg.Start.Format("20060102T150405Z"), *format)
		if err := writeFile(filepath.Join(*out, name), func(w io.Writer) error {
			samples := simulate.Flight(cfg)
			if *format == "json" {
				return simulate.WriteJSON(w, samples)
			}
			return simulate.WriteCSV(w, samples, *inAir)
		}); err != nil {
			return err
		}
		if _, err := fmt.Fprintln(stdout, filepath.Join(*out, name)); err != nil {
			return err
		}
	}
	return nil
}

// writeFile writes to a hidden temporary file and renames it into place, so the ingest service
// never sees a partially written log.
func writeFile(path string, write func(io.Writer) error) error {
	tmp := filepath.Join(filepath.Dir(path), "."+filepath.Base(path)+".tmp")
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if err := write(f); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}
