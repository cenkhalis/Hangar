package message

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/cenkhalis/hangar/ingest/internal/summary"
)

var goldenPath = filepath.Join("..", "..", "..", "contracts", "flight-log", "v1", "message.json")

func mustTime(t *testing.T, s string) time.Time {
	t.Helper()
	ts, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatal(err)
	}
	return ts
}

// TestContractGolden fails if the Go payload drifts from the shared contract that the Django
// consumer is tested against.
func TestContractGolden(t *testing.T) {
	golden, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("read golden: %v", err)
	}
	ist := time.FixedZone("UTC+3", 3*3600)
	msg := New(
		"3f2b7c1e9a4d5f60718293a4b5c6d7e8f90112233445566778899aabbccddeef",
		summary.Summary{
			AircraftSerial:  "AC-00042",
			DepartureAt:     mustTime(t, "2026-10-12T08:14:03Z").In(ist),
			ArrivalAt:       mustTime(t, "2026-10-12T08:41:57Z"),
			SampleCount:     1674,
			MaxAltitudeM:    118.4,
			MaxSpeedMPS:     17.2,
			DistanceM:       9213.7,
			BatteryStartPct: 98,
			BatteryEndPct:   31.5,
			Start:           summary.Position{Lat: 41.0151, Lon: 28.9795},
			End:             summary.Position{Lat: 41.0149, Lon: 28.9801},
		},
		Source{
			Filename:   "AC-00042_20261012T081403Z.csv",
			Format:     "csv",
			IngestedAt: mustTime(t, "2026-10-12T09:00:00Z").In(ist),
		},
	)

	encoded, err := json.Marshal(msg)
	if err != nil {
		t.Fatal(err)
	}
	var got, want map[string]any
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(golden, &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("payload does not match contract golden\n got: %s\nwant: %s", encoded, golden)
	}
}

func TestNewRoundsMetrics(t *testing.T) {
	msg := New("id", summary.Summary{
		DistanceM: 1234.5678, MaxAltitudeM: 99.999, Start: summary.Position{Lat: 41.123456789, Lon: 29.1},
	}, Source{})

	if msg.Telemetry.DistanceM != 1234.57 || msg.Telemetry.MaxAltitudeM != 100 {
		t.Errorf("metrics not rounded: %+v", msg.Telemetry)
	}
	if msg.Telemetry.Start.Lat != 41.1234568 {
		t.Errorf("lat = %v, want 7 decimals", msg.Telemetry.Start.Lat)
	}
	if msg.Cycles != 1 {
		t.Errorf("Cycles = %d, want 1", msg.Cycles)
	}
}
