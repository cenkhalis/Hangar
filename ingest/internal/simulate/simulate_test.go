package simulate

import (
	"bytes"
	"math"
	"reflect"
	"testing"
	"time"

	"github.com/cenkhalis/hangar/ingest/internal/parser"
	"github.com/cenkhalis/hangar/ingest/internal/summary"
	"github.com/cenkhalis/hangar/ingest/internal/telemetry"
	"github.com/cenkhalis/hangar/ingest/internal/validator"
)

var start = time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)

func TestFlightIsValidSingleSortie(t *testing.T) {
	cfg := DefaultConfig("AC-1", start)
	samples := Flight(cfg)

	if err := validator.Validate(samples, validator.DefaultConfig()); err != nil {
		t.Fatalf("generated flight is invalid: %v", err)
	}
	s, err := summary.Summarize(samples, telemetry.DefaultAirborneAltitudeM)
	if err != nil {
		t.Fatal(err)
	}

	airborne := s.ArrivalAt.Sub(s.DepartureAt)
	wantAirborne := cfg.CruiseDuration + time.Duration((cfg.CruiseAltitudeM/cfg.ClimbRateMPS+cfg.CruiseAltitudeM/cfg.DescentRateMPS)*float64(time.Second))
	if math.Abs((airborne - wantAirborne).Seconds()) > 5 {
		t.Errorf("airborne time = %v, want ≈ %v", airborne, wantAirborne)
	}
	if !s.DepartureAt.After(start) {
		t.Errorf("departure %v should follow the ground idle period", s.DepartureAt)
	}
	if s.MaxAltitudeM < 95 || s.MaxAltitudeM > 110 {
		t.Errorf("MaxAltitudeM = %v", s.MaxAltitudeM)
	}
	wantDistance := cfg.CruiseSpeedMPS * cfg.CruiseDuration.Seconds()
	if math.Abs(s.DistanceM-wantDistance)/wantDistance > 0.1 {
		t.Errorf("DistanceM = %v, want ≈ %v", s.DistanceM, wantDistance)
	}
	if s.BatteryStartPct < 95 || s.BatteryEndPct > 40 || s.BatteryEndPct < 25 {
		t.Errorf("battery %v -> %v", s.BatteryStartPct, s.BatteryEndPct)
	}
	if d := summary.HaversineM(cfg.Home, s.End); d > 50 {
		t.Errorf("flight should end near home, ended %v m away", d)
	}
}

func TestFlightIsDeterministicPerSeed(t *testing.T) {
	cfg := DefaultConfig("AC-1", start)
	a, b := Flight(cfg), Flight(cfg)
	cfg.Seed = 2
	c := Flight(cfg)

	if !reflect.DeepEqual(a, b) {
		t.Error("same seed produced different flights")
	}
	if reflect.DeepEqual(a, c) {
		t.Error("different seeds produced identical flights")
	}
}

func TestIncludeInAir(t *testing.T) {
	cfg := DefaultConfig("AC-1", start)
	cfg.IncludeInAir = true

	samples := Flight(cfg)

	for i, s := range samples {
		if s.InAir == nil {
			t.Fatalf("sample %d missing in_air", i)
		}
	}
	if err := validator.Validate(samples, validator.DefaultConfig()); err != nil {
		t.Errorf("flight with in_air is invalid: %v", err)
	}
}

func TestWritersRoundTripThroughParser(t *testing.T) {
	cfg := DefaultConfig("AC-7", start)
	cfg.CruiseDuration = 3 * time.Minute
	cfg.IncludeInAir = true
	samples := Flight(cfg)
	want, err := summary.Summarize(samples, telemetry.DefaultAirborneAltitudeM)
	if err != nil {
		t.Fatal(err)
	}

	var csvBuf, jsonBuf bytes.Buffer
	if err := WriteCSV(&csvBuf, samples, true); err != nil {
		t.Fatal(err)
	}
	if err := WriteJSON(&jsonBuf, samples); err != nil {
		t.Fatal(err)
	}

	for format, buf := range map[parser.Format]*bytes.Buffer{parser.CSV: &csvBuf, parser.JSON: &jsonBuf} {
		res, err := parser.Parse(buf, format)
		if err != nil {
			t.Fatalf("%s: Parse() = %v", format, err)
		}
		if err := validator.Validate(res.Samples, validator.DefaultConfig()); err != nil {
			t.Fatalf("%s: Validate() = %v", format, err)
		}
		got, err := summary.Summarize(res.Samples, telemetry.DefaultAirborneAltitudeM)
		if err != nil {
			t.Fatal(err)
		}
		if !got.DepartureAt.Equal(want.DepartureAt) || !got.ArrivalAt.Equal(want.ArrivalAt) ||
			got.SampleCount != want.SampleCount || math.Abs(got.DistanceM-want.DistanceM) > 1 {
			t.Errorf("%s: summary after round trip = %+v, want %+v", format, got, want)
		}
	}
}
