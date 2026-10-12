package telemetry

import (
	"reflect"
	"testing"
)

func boolPtr(b bool) *bool { return &b }

func TestAirborne(t *testing.T) {
	tests := []struct {
		name   string
		sample Sample
		want   bool
	}{
		{"above threshold", Sample{AltAGLM: 1.5}, true},
		{"exactly at threshold", Sample{AltAGLM: 1.0}, false},
		{"below threshold", Sample{AltAGLM: 0.3}, false},
		{"explicit in_air overrides low altitude", Sample{AltAGLM: 0.2, InAir: boolPtr(true)}, true},
		{"explicit on-ground overrides altitude", Sample{AltAGLM: 50, InAir: boolPtr(false)}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.sample.Airborne(DefaultAirborneAltitudeM); got != tt.want {
				t.Errorf("Airborne() = %v, want %v", got, tt.want)
			}
		})
	}
}

func alts(values ...float64) []Sample {
	samples := make([]Sample, len(values))
	for i, v := range values {
		samples[i] = Sample{AltAGLM: v}
	}
	return samples
}

func TestAirborneSegments(t *testing.T) {
	tests := []struct {
		name    string
		samples []Sample
		want    []Segment
	}{
		{"empty", nil, nil},
		{"all ground", alts(0, 0, 0), nil},
		{"single segment", alts(0, 5, 10, 5, 0), []Segment{{1, 3}}},
		{"airborne at start and end", alts(5, 10, 5), []Segment{{0, 2}}},
		{"two segments", alts(0, 5, 0, 0, 7, 8, 0), []Segment{{1, 1}, {4, 5}}},
		{
			"mixed explicit and fallback",
			[]Sample{{AltAGLM: 0}, {AltAGLM: 0.5, InAir: boolPtr(true)}, {AltAGLM: 20}, {AltAGLM: 0}},
			[]Segment{{1, 2}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := AirborneSegments(tt.samples, DefaultAirborneAltitudeM); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("AirborneSegments() = %v, want %v", got, tt.want)
			}
		})
	}
}
