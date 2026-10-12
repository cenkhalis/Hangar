package queue

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"

	"github.com/cenkhalis/hangar/ingest/internal/message"
)

func newTestClient(t *testing.T) (*RedisClient, *miniredis.Miniredis) {
	t.Helper()
	srv := miniredis.RunT(t)
	c, err := NewRedisClient("redis://" + srv.Addr() + "/0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close() })
	return c, srv
}

func TestPublishFlightLog(t *testing.T) {
	c, srv := newTestClient(t)
	msg := message.FlightLog{
		LogID:          "abc",
		AircraftSerial: "AC-1",
		DepartureAt:    time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC),
		Cycles:         1,
	}

	id, err := c.PublishFlightLog(context.Background(), msg)
	if err != nil {
		t.Fatalf("PublishFlightLog() error = %v", err)
	}

	entries, err := srv.Stream(FlightLogStream)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].ID != id {
		t.Fatalf("entries = %+v, want one with id %s", entries, id)
	}
	values := map[string]string{}
	for i := 0; i+1 < len(entries[0].Values); i += 2 {
		values[entries[0].Values[i]] = entries[0].Values[i+1]
	}
	if values["schema_version"] != "1" {
		t.Errorf("schema_version = %q", values["schema_version"])
	}
	var decoded message.FlightLog
	if err := json.Unmarshal([]byte(values["payload"]), &decoded); err != nil {
		t.Fatalf("payload is not JSON: %v", err)
	}
	if decoded.LogID != "abc" || !decoded.DepartureAt.Equal(msg.DepartureAt) {
		t.Errorf("decoded payload = %+v", decoded)
	}
}

func TestPublishFlightLogFailsWhenRedisIsDown(t *testing.T) {
	c, srv := newTestClient(t)
	srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := c.PublishFlightLog(ctx, message.FlightLog{}); err == nil {
		t.Fatal("expected error when Redis is down")
	}
}
