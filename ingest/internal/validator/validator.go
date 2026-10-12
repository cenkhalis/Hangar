// Package validator checks parsed flight logs for schema and physical plausibility.
package validator

import (
	"fmt"
	"math"
	"strings"

	"github.com/cenkhalis/hangar/ingest/internal/telemetry"
)

// Config holds validation limits.
type Config struct {
	MinSamples        int
	AirborneAltitudeM float64
	MinAltitudeM      float64
	MaxAltitudeM      float64
	MaxSpeedMPS       float64
	// MaxProblems caps the number of problems reported for one log.
	MaxProblems int
}

// DefaultConfig returns limits suitable for small UAVs.
func DefaultConfig() Config {
	return Config{
		MinSamples:        2,
		AirborneAltitudeM: telemetry.DefaultAirborneAltitudeM,
		MinAltitudeM:      -100,
		MaxAltitudeM:      10_000,
		MaxSpeedMPS:       150,
		MaxProblems:       50,
	}
}

// Problem is a single validation failure. Sample is the 1-based sample index; 0 means the log as
// a whole.
type Problem struct {
	Sample int
	Msg    string
}

func (p Problem) String() string {
	if p.Sample == 0 {
		return p.Msg
	}
	return fmt.Sprintf("sample %d: %s", p.Sample, p.Msg)
}

// Error lists every problem found in a log.
type Error struct {
	Problems  []Problem
	Truncated bool
}

func (e *Error) Error() string {
	lines := make([]string, len(e.Problems))
	for i, p := range e.Problems {
		lines[i] = p.String()
	}
	msg := fmt.Sprintf("invalid flight log (%d problems): %s", len(e.Problems), strings.Join(lines, "; "))
	if e.Truncated {
		msg += "; further problems omitted"
	}
	return msg
}

type collector struct {
	err Error
	max int
}

func (c *collector) add(sample int, format string, args ...any) {
	if len(c.err.Problems) >= c.max {
		c.err.Truncated = true
		return
	}
	c.err.Problems = append(c.err.Problems, Problem{Sample: sample, Msg: fmt.Sprintf(format, args...)})
}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

func inRange(v, lo, hi float64) bool { return finite(v) && v >= lo && v <= hi }

// Validate reports every problem in the log, or nil if it is valid.
func Validate(samples []telemetry.Sample, cfg Config) error {
	c := &collector{max: cfg.MaxProblems}

	if len(samples) < cfg.MinSamples {
		c.add(0, "has %d samples, need at least %d", len(samples), cfg.MinSamples)
	}

	var serial string
	if len(samples) > 0 {
		serial = samples[0].AircraftSerial
	}
	for i, s := range samples {
		n := i + 1
		switch {
		case s.AircraftSerial == "":
			c.add(n, "aircraft_serial is empty")
		case s.AircraftSerial != serial:
			c.add(n, "aircraft_serial %q differs from %q; one aircraft per log", s.AircraftSerial, serial)
		}
		if i > 0 && !s.Timestamp.After(samples[i-1].Timestamp) {
			c.add(n, "timestamp %s is not after the previous sample", s.Timestamp.Format("2006-01-02T15:04:05.999Z07:00"))
		}
		if !inRange(s.Lat, -90, 90) {
			c.add(n, "lat %v out of range [-90, 90]", s.Lat)
		}
		if !inRange(s.Lon, -180, 180) {
			c.add(n, "lon %v out of range [-180, 180]", s.Lon)
		}
		if !inRange(s.AltAGLM, cfg.MinAltitudeM, cfg.MaxAltitudeM) {
			c.add(n, "alt_agl_m %v out of range [%v, %v]", s.AltAGLM, cfg.MinAltitudeM, cfg.MaxAltitudeM)
		}
		if !inRange(s.SpeedMPS, 0, cfg.MaxSpeedMPS) {
			c.add(n, "speed_mps %v out of range [0, %v]", s.SpeedMPS, cfg.MaxSpeedMPS)
		}
		if !inRange(s.BatteryPct, 0, 100) {
			c.add(n, "battery_pct %v out of range [0, 100]", s.BatteryPct)
		}
	}

	switch segments := telemetry.AirborneSegments(samples, cfg.AirborneAltitudeM); {
	case len(samples) == 0:
	case len(segments) == 0:
		c.add(0, "no airborne segment")
	case len(segments) > 1:
		c.add(0, "%d airborne segments; only single-sortie logs are supported", len(segments))
	case segments[0].Start == segments[0].End:
		c.add(segments[0].Start+1, "airborne segment has a single sample; duration would be zero")
	}

	if len(c.err.Problems) > 0 {
		return &c.err
	}
	return nil
}
