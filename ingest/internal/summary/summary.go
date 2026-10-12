// Package summary reduces a validated flight log to the per-flight figures sent downstream.
package summary

import (
	"errors"
	"math"
	"time"

	"github.com/cenkhalis/hangar/ingest/internal/telemetry"
)

// EarthRadiusM is the mean Earth radius used for haversine distances.
const EarthRadiusM = 6_371_000.0

// ErrNotSingleSortie is returned when the log does not contain exactly one airborne segment of at
// least two samples. Validate rejects such logs first; this guards direct callers.
var ErrNotSingleSortie = errors.New("log must contain exactly one airborne segment of two or more samples")

// Position is a geographic coordinate in degrees.
type Position struct {
	Lat float64
	Lon float64
}

// Summary describes one flight.
type Summary struct {
	AircraftSerial  string
	DepartureAt     time.Time
	ArrivalAt       time.Time
	SampleCount     int
	MaxAltitudeM    float64
	MaxSpeedMPS     float64
	DistanceM       float64
	BatteryStartPct float64
	BatteryEndPct   float64
	Start           Position
	End             Position
}

// Summarize computes the flight summary. Departure and arrival are the first and last airborne
// samples; distance covers the airborne path; battery figures come from the first and last sample
// of the whole log; maxima cover every sample.
func Summarize(samples []telemetry.Sample, airborneThresholdM float64) (Summary, error) {
	segments := telemetry.AirborneSegments(samples, airborneThresholdM)
	if len(segments) != 1 || segments[0].Start == segments[0].End {
		return Summary{}, ErrNotSingleSortie
	}
	first, last := samples[segments[0].Start], samples[segments[0].End]

	s := Summary{
		AircraftSerial:  first.AircraftSerial,
		DepartureAt:     first.Timestamp,
		ArrivalAt:       last.Timestamp,
		SampleCount:     len(samples),
		BatteryStartPct: samples[0].BatteryPct,
		BatteryEndPct:   samples[len(samples)-1].BatteryPct,
		Start:           Position{first.Lat, first.Lon},
		End:             Position{last.Lat, last.Lon},
		MaxAltitudeM:    math.Inf(-1),
	}
	for _, sample := range samples {
		s.MaxAltitudeM = math.Max(s.MaxAltitudeM, sample.AltAGLM)
		s.MaxSpeedMPS = math.Max(s.MaxSpeedMPS, sample.SpeedMPS)
	}
	for i := segments[0].Start + 1; i <= segments[0].End; i++ {
		s.DistanceM += HaversineM(
			Position{samples[i-1].Lat, samples[i-1].Lon},
			Position{samples[i].Lat, samples[i].Lon},
		)
	}
	return s, nil
}

// HaversineM returns the great-circle distance between two positions in metres.
func HaversineM(a, b Position) float64 {
	toRad := func(deg float64) float64 { return deg * math.Pi / 180 }
	dLat := toRad(b.Lat - a.Lat)
	dLon := toRad(b.Lon - a.Lon)
	h := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(a.Lat))*math.Cos(toRad(b.Lat))*math.Sin(dLon/2)*math.Sin(dLon/2)
	return 2 * EarthRadiusM * math.Asin(math.Min(1, math.Sqrt(h)))
}
