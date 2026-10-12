package main

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"

	"github.com/cenkhalis/hangar/ingest/internal/queue"
	"github.com/cenkhalis/hangar/ingest/internal/simulate"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func getenv(env map[string]string) func(string) string {
	return func(k string) string { return env[k] }
}

func TestRunFailsWithoutConfig(t *testing.T) {
	err := run(context.Background(), func(string) string { return "" }, discardLogger())
	if err == nil {
		t.Fatal("expected error when REDIS_URL is missing")
	}
}

func TestRunFailsWhenRedisIsUnreachable(t *testing.T) {
	srv := miniredis.RunT(t)
	addr := srv.Addr()
	srv.Close()
	env := map[string]string{"REDIS_URL": "redis://" + addr + "/0", "INBOX_DIR": t.TempDir()}

	if err := run(context.Background(), getenv(env), discardLogger()); err == nil {
		t.Fatal("expected error when Redis is unreachable")
	}
}

func TestRunStopsOnContextCancel(t *testing.T) {
	srv := miniredis.RunT(t)
	env := map[string]string{"REDIS_URL": "redis://" + srv.Addr() + "/0", "INBOX_DIR": t.TempDir()}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- run(ctx, getenv(env), discardLogger()) }()

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("run() error = %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("run() did not return after context cancellation")
	}
}

func TestRunPublishesSimulatedLogFromInbox(t *testing.T) {
	srv := miniredis.RunT(t)
	root := t.TempDir()
	env := map[string]string{
		"REDIS_URL": "redis://" + srv.Addr() + "/0", "INBOX_DIR": root,
		"POLL_INTERVAL": "10ms", "INBOX_SETTLE": "0s",
	}
	if err := os.MkdirAll(filepath.Join(root, "inbox"), 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := simulate.DefaultConfig("AC-00042", time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC))
	cfg.CruiseDuration = time.Minute
	f, err := os.Create(filepath.Join(root, "inbox", "flight.csv"))
	if err != nil {
		t.Fatal(err)
	}
	if err := simulate.WriteCSV(f, simulate.Flight(cfg), false); err != nil {
		t.Fatal(err)
	}
	_ = f.Close()

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- run(ctx, getenv(env), discardLogger()) }()

	deadline := time.Now().Add(5 * time.Second)
	for {
		if entries, err := srv.Stream(queue.FlightLogStream); err == nil && len(entries) == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("flight log was not published")
		}
		time.Sleep(10 * time.Millisecond)
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "processed", "flight.csv")); err != nil {
		t.Errorf("file not archived: %v", err)
	}
}
