// Package parser decodes raw CSV and JSON flight logs into telemetry samples.
package parser

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/cenkhalis/hangar/ingest/internal/telemetry"
)

// Format is a supported raw log format.
type Format string

// Supported formats.
const (
	CSV  Format = "csv"
	JSON Format = "json"
)

// ErrUnknownFormat is returned for files whose extension is not a supported format.
var ErrUnknownFormat = errors.New("unknown log format")

// FormatFromPath derives the format from a file extension (case-insensitive).
func FormatFromPath(path string) (Format, error) {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".csv":
		return CSV, nil
	case ".json":
		return JSON, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrUnknownFormat, filepath.Ext(path))
	}
}

// Result is a parsed log.
type Result struct {
	Samples []telemetry.Sample
	// LogID is the lowercase hex SHA-256 of the raw bytes, used as the idempotency key.
	LogID string
}

// Error describes a malformed log. Row is the CSV line or 1-based JSON sample index; 0 means
// the error concerns the file as a whole.
type Error struct {
	Row   int
	Field string
	Msg   string
}

func (e *Error) Error() string {
	switch {
	case e.Row == 0:
		return e.Msg
	case e.Field == "":
		return fmt.Sprintf("row %d: %s", e.Row, e.Msg)
	default:
		return fmt.Sprintf("row %d: field %q: %s", e.Row, e.Field, e.Msg)
	}
}

// Field names shared by both formats.
const (
	fieldTimestamp = "timestamp"
	fieldSerial    = "aircraft_serial"
	fieldLat       = "lat"
	fieldLon       = "lon"
	fieldAlt       = "alt_agl_m"
	fieldSpeed     = "speed_mps"
	fieldBattery   = "battery_pct"
	fieldInAir     = "in_air"
)

var requiredFields = []string{
	fieldTimestamp, fieldSerial, fieldLat, fieldLon, fieldAlt, fieldSpeed, fieldBattery,
}

// Parse reads the whole log, streaming samples, and hashes the raw bytes as it goes.
func Parse(r io.Reader, format Format) (Result, error) {
	hash := sha256.New()
	tee := io.TeeReader(r, hash)

	var (
		samples []telemetry.Sample
		err     error
	)
	switch format {
	case CSV:
		samples, err = parseCSV(tee)
	case JSON:
		samples, err = parseJSON(tee)
	default:
		return Result{}, fmt.Errorf("%w: %q", ErrUnknownFormat, format)
	}
	if err != nil {
		return Result{}, err
	}
	// Decoders may stop before EOF (e.g. trailing whitespace); the hash must cover every byte.
	if _, err := io.Copy(io.Discard, tee); err != nil {
		return Result{}, fmt.Errorf("read log: %w", err)
	}
	return Result{Samples: samples, LogID: hex.EncodeToString(hash.Sum(nil))}, nil
}

func parseTimestamp(row int, raw string) (time.Time, error) {
	ts, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(raw))
	if err != nil {
		return time.Time{}, &Error{Row: row, Field: fieldTimestamp, Msg: "not an RFC 3339 timestamp"}
	}
	return ts.UTC(), nil
}

func parseFloat(row int, field, raw string) (float64, error) {
	v, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil {
		return 0, &Error{Row: row, Field: field, Msg: fmt.Sprintf("not a number: %q", raw)}
	}
	return v, nil
}
