package main

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
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
	env := map[string]string{"REDIS_URL": "redis://" + addr + "/0"}

	if err := run(context.Background(), func(k string) string { return env[k] }, discardLogger()); err == nil {
		t.Fatal("expected error when Redis is unreachable")
	}
}

func TestRunStopsOnContextCancel(t *testing.T) {
	srv := miniredis.RunT(t)
	env := map[string]string{"REDIS_URL": "redis://" + srv.Addr() + "/0"}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- run(ctx, func(k string) string { return env[k] }, discardLogger()) }()

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
