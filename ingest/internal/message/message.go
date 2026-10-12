// Package message defines the flight log message published to Redis (contract v1, see
// contracts/flight-log/v1).
package message

import (
	"math"
	"time"

	"github.com/cenkhalis/hangar/ingest/internal/summary"
)

// SchemaVersion is the contract version carried in each stream entry.
const SchemaVersion = "1"

// Position is a coordinate in degrees.
type Position struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

// Telemetry is the flight's telemetry summary.
type Telemetry struct {
	SampleCount     int      `json:"sample_count"`
	MaxAltitudeM    float64  `json:"max_altitude_m"`
	MaxSpeedMPS     float64  `json:"max_speed_mps"`
	DistanceM       float64  `json:"distance_m"`
	BatteryStartPct float64  `json:"battery_start_pct"`
	BatteryEndPct   float64  `json:"battery_end_pct"`
	Start           Position `json:"start"`
	End             Position `json:"end"`
}

// Source identifies the raw log file.
type Source struct {
	Filename   string    `json:"filename"`
	Format     string    `json:"format"`
	IngestedAt time.Time `json:"ingested_at"`
}

// FlightLog is the message payload.
type FlightLog struct {
	LogID          string    `json:"log_id"`
	AircraftSerial string    `json:"aircraft_serial"`
	DepartureAt    time.Time `json:"departure_at"`
	ArrivalAt      time.Time `json:"arrival_at"`
	Cycles         int       `json:"cycles"`
	Telemetry      Telemetry `json:"telemetry"`
	Source         Source    `json:"source"`
}

func round(v float64, decimals int) float64 {
	p := math.Pow(10, float64(decimals))
	return math.Round(v*p) / p
}

func position(p summary.Position) Position {
	return Position{Lat: round(p.Lat, 7), Lon: round(p.Lon, 7)}
}

// New builds a message for a single-sortie log. Metrics are rounded to centimetre/0.01 precision
// and coordinates to 7 decimals (~1 cm); timestamps are normalised to UTC.
func New(logID string, s summary.Summary, src Source) FlightLog {
	src.IngestedAt = src.IngestedAt.UTC()
	return FlightLog{
		LogID:          logID,
		AircraftSerial: s.AircraftSerial,
		DepartureAt:    s.DepartureAt.UTC(),
		ArrivalAt:      s.ArrivalAt.UTC(),
		Cycles:         1,
		Telemetry: Telemetry{
			SampleCount:     s.SampleCount,
			MaxAltitudeM:    round(s.MaxAltitudeM, 2),
			MaxSpeedMPS:     round(s.MaxSpeedMPS, 2),
			DistanceM:       round(s.DistanceM, 2),
			BatteryStartPct: round(s.BatteryStartPct, 2),
			BatteryEndPct:   round(s.BatteryEndPct, 2),
			Start:           position(s.Start),
			End:             position(s.End),
		},
		Source: src,
	}
}
