package validator

import (
	"errors"
	"math"
	"strings"
	"testing"
	"time"

	"github.com/cenkhalis/hangar/ingest/internal/telemetry"
)

var t0 = time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)

// flight returns a valid ground-air-ground log.
func flight() []telemetry.Sample {
	alts := []float64{0, 10, 50, 10, 0}
	samples := make([]telemetry.Sample, len(alts))
	for i, alt := range alts {
		samples[i] = telemetry.Sample{
			Timestamp: t0.Add(time.Duration(i) * time.Second), AircraftSerial: "AC-1",
			Lat: 41, Lon: 29, AltAGLM: alt, SpeedMPS: 10, BatteryPct: 90,
		}
	}
	return samples
}

func TestValidLogPasses(t *testing.T) {
	if err := Validate(flight(), DefaultConfig()); err != nil {
		t.Fatalf("Validate() = %v", err)
	}
}

func TestRules(t *testing.T) {
	tests := []struct {
		name       string
		mutate     func([]telemetry.Sample) []telemetry.Sample
		wantSample int
		wantMsg    string
	}{
		{"too few samples", func(s []telemetry.Sample) []telemetry.Sample { return s[:1] }, 0, "at least 2"},
		{"empty log", func([]telemetry.Sample) []telemetry.Sample { return nil }, 0, "has 0 samples"},
		{"empty serial", func(s []telemetry.Sample) []telemetry.Sample { s[2].AircraftSerial = ""; return s }, 3, "empty"},
		{"mixed serials", func(s []telemetry.Sample) []telemetry.Sample { s[3].AircraftSerial = "AC-2"; return s }, 4, "one aircraft per log"},
		{"duplicate timestamp", func(s []telemetry.Sample) []telemetry.Sample { s[2].Timestamp = s[1].Timestamp; return s }, 3, "not after"},
		{"timestamp goes back", func(s []telemetry.Sample) []telemetry.Sample { s[4].Timestamp = t0; return s }, 5, "not after"},
		{"lat out of range", func(s []telemetry.Sample) []telemetry.Sample { s[0].Lat = 90.1; return s }, 1, "lat"},
		{"lon out of range", func(s []telemetry.Sample) []telemetry.Sample { s[0].Lon = -180.5; return s }, 1, "lon"},
		{"lat NaN", func(s []telemetry.Sample) []telemetry.Sample { s[1].Lat = math.NaN(); return s }, 2, "lat"},
		{"altitude too high", func(s []telemetry.Sample) []telemetry.Sample { s[2].AltAGLM = 20_000; return s }, 3, "alt_agl_m"},
		{"altitude too low", func(s []telemetry.Sample) []telemetry.Sample { s[0].AltAGLM = -500; return s }, 1, "alt_agl_m"},
		{"altitude infinite", func(s []telemetry.Sample) []telemetry.Sample { s[2].AltAGLM = math.Inf(1); return s }, 3, "alt_agl_m"},
		{"negative speed", func(s []telemetry.Sample) []telemetry.Sample { s[1].SpeedMPS = -1; return s }, 2, "speed_mps"},
		{"speed too high", func(s []telemetry.Sample) []telemetry.Sample { s[1].SpeedMPS = 400; return s }, 2, "speed_mps"},
		{"battery over 100", func(s []telemetry.Sample) []telemetry.Sample { s[0].BatteryPct = 100.1; return s }, 1, "battery_pct"},
		{"battery negative", func(s []telemetry.Sample) []telemetry.Sample { s[4].BatteryPct = -1; return s }, 5, "battery_pct"},
		{"never airborne", func(s []telemetry.Sample) []telemetry.Sample {
			for i := range s {
				s[i].AltAGLM = 0
			}
			return s
		}, 0, "no airborne segment"},
		{"two sorties", func(s []telemetry.Sample) []telemetry.Sample { s[2].AltAGLM = 0; return s }, 0, "2 airborne segments"},
		{"single airborne sample", func(s []telemetry.Sample) []telemetry.Sample {
			s[1].AltAGLM, s[3].AltAGLM = 0, 0
			return s
		}, 3, "single sample"},
		{"explicit in_air false splits sortie", func(s []telemetry.Sample) []telemetry.Sample {
			ground := false
			s[2].InAir = &ground
			return s
		}, 0, "2 airborne segments"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := Validate(tt.mutate(flight()), DefaultConfig())
			var ve *Error
			if !errors.As(err, &ve) {
				t.Fatalf("Validate() = %v, want *validator.Error", err)
			}
			for _, p := range ve.Problems {
				if p.Sample == tt.wantSample && strings.Contains(p.Msg, tt.wantMsg) {
					return
				}
			}
			t.Errorf("no problem at sample %d containing %q; got %v", tt.wantSample, tt.wantMsg, ve.Problems)
		})
	}
}

func TestAllProblemsAreCollected(t *testing.T) {
	samples := flight()
	samples[0].Lat = 100
	samples[1].BatteryPct = 200
	samples[3].SpeedMPS = -5

	var ve *Error
	if !errors.As(Validate(samples, DefaultConfig()), &ve) {
		t.Fatal("expected validation error")
	}
	if len(ve.Problems) != 3 {
		t.Errorf("got %d problems, want 3: %v", len(ve.Problems), ve.Problems)
	}
	if !strings.Contains(ve.Error(), "sample 2: battery_pct") {
		t.Errorf("Error() = %q", ve.Error())
	}
}

func TestProblemsAreCapped(t *testing.T) {
	samples := flight()
	for i := range samples {
		samples[i].Lat, samples[i].Lon, samples[i].BatteryPct = 100, 200, 300
	}
	cfg := DefaultConfig()
	cfg.MaxProblems = 4

	var ve *Error
	if !errors.As(Validate(samples, cfg), &ve) {
		t.Fatal("expected validation error")
	}
	if len(ve.Problems) != 4 || !ve.Truncated {
		t.Errorf("got %d problems truncated=%v, want 4 truncated", len(ve.Problems), ve.Truncated)
	}
	if !strings.HasSuffix(ve.Error(), "further problems omitted") {
		t.Errorf("Error() = %q", ve.Error())
	}
}

func TestCustomAirborneThreshold(t *testing.T) {
	cfg := DefaultConfig()
	cfg.AirborneAltitudeM = 60 // nothing in flight() exceeds 50 m

	if err := Validate(flight(), cfg); err == nil || !strings.Contains(err.Error(), "no airborne") {
		t.Errorf("Validate() = %v, want no airborne segment", err)
	}
}
