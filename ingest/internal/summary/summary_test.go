package summary

import (
	"errors"
	"math"
	"testing"
	"time"

	"github.com/cenkhalis/hangar/ingest/internal/telemetry"
)

var t0 = time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)

// sample builds a sample at longitude 29; distances in these tests run along latitude.
func sample(sec int, lat, alt, speed, battery float64) telemetry.Sample {
	return telemetry.Sample{
		Timestamp: t0.Add(time.Duration(sec) * time.Second), AircraftSerial: "AC-1",
		Lat: lat, Lon: 29, AltAGLM: alt, SpeedMPS: speed, BatteryPct: battery,
	}
}

func approx(t *testing.T, name string, got, want, tol float64) {
	t.Helper()
	if math.Abs(got-want) > tol {
		t.Errorf("%s = %v, want %v ± %v", name, got, want, tol)
	}
}

func TestHaversineOneDegreeOfLatitude(t *testing.T) {
	approx(t, "distance", HaversineM(Position{0, 0}, Position{1, 0}), 111_194.9, 0.1)
}

func TestHaversineIsZeroForSamePoint(t *testing.T) {
	approx(t, "distance", HaversineM(Position{41, 29}, Position{41, 29}), 0, 1e-9)
}

func TestHaversineLongitudeShrinksWithLatitude(t *testing.T) {
	atEquator := HaversineM(Position{0, 0}, Position{0, 1})
	at60 := HaversineM(Position{60, 0}, Position{60, 1})
	approx(t, "ratio", at60/atEquator, 0.5, 1e-3)
}

func TestSummarize(t *testing.T) {
	samples := []telemetry.Sample{
		sample(0, 41.0000, 0, 0, 99),      // ground: excluded from departure and distance
		sample(10, 41.0000, 0.5, 2, 98.5), // still below 1 m threshold
		sample(20, 41.0010, 30, 12, 97),   // departure
		sample(30, 41.0020, 120.5, 18, 80),
		sample(40, 41.0030, 5, 6, 60),  // arrival
		sample(50, 41.0090, 0, 25, 55), // ground taxi: excluded from distance, included in max speed
	}

	s, err := Summarize(samples, telemetry.DefaultAirborneAltitudeM)
	if err != nil {
		t.Fatal(err)
	}

	if !s.DepartureAt.Equal(t0.Add(20*time.Second)) || !s.ArrivalAt.Equal(t0.Add(40*time.Second)) {
		t.Errorf("departure/arrival = %v / %v", s.DepartureAt, s.ArrivalAt)
	}
	if s.AircraftSerial != "AC-1" || s.SampleCount != 6 {
		t.Errorf("serial/count = %q / %d", s.AircraftSerial, s.SampleCount)
	}
	approx(t, "MaxAltitudeM", s.MaxAltitudeM, 120.5, 0)
	approx(t, "MaxSpeedMPS", s.MaxSpeedMPS, 25, 0)
	approx(t, "DistanceM", s.DistanceM, 2*111.1949, 0.01) // two 0.001° latitude legs
	approx(t, "BatteryStartPct", s.BatteryStartPct, 99, 0)
	approx(t, "BatteryEndPct", s.BatteryEndPct, 55, 0)
	if s.Start != (Position{41.0010, 29.0}) || s.End != (Position{41.0030, 29.0}) {
		t.Errorf("start/end = %v / %v", s.Start, s.End)
	}
}

func TestSummarizeUsesExplicitInAir(t *testing.T) {
	inAir := true
	samples := []telemetry.Sample{sample(0, 41, 0, 0, 99), sample(1, 41, 0.3, 1, 99), sample(2, 41, 5, 3, 99), sample(3, 41, 0, 0, 99)}
	samples[1].InAir = &inAir

	s, err := Summarize(samples, telemetry.DefaultAirborneAltitudeM)
	if err != nil {
		t.Fatal(err)
	}
	if !s.DepartureAt.Equal(t0.Add(time.Second)) {
		t.Errorf("DepartureAt = %v, want the in_air sample", s.DepartureAt)
	}
}

func TestSummarizeRejectsNonSingleSortie(t *testing.T) {
	tests := map[string][]telemetry.Sample{
		"no airborne":     {sample(0, 41, 0, 0, 99), sample(1, 41, 0, 0, 99)},
		"two segments":    {sample(0, 41, 5, 0, 99), sample(1, 41, 0, 0, 99), sample(2, 41, 5, 0, 99), sample(3, 41, 5, 0, 99)},
		"single airborne": {sample(0, 41, 0, 0, 99), sample(1, 41, 5, 0, 99), sample(2, 41, 0, 0, 99)},
		"empty":           nil,
	}
	for name, samples := range tests {
		t.Run(name, func(t *testing.T) {
			if _, err := Summarize(samples, telemetry.DefaultAirborneAltitudeM); !errors.Is(err, ErrNotSingleSortie) {
				t.Errorf("error = %v, want ErrNotSingleSortie", err)
			}
		})
	}
}
