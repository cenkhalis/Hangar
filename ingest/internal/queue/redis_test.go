package queue

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
)

func TestNewRedisClientRejectsInvalidURL(t *testing.T) {
	if _, err := NewRedisClient("not-a-url"); err == nil {
		t.Fatal("expected error for invalid URL")
	}
}

func TestPingSucceedsAgainstRunningServer(t *testing.T) {
	srv := miniredis.RunT(t)

	c, err := NewRedisClient("redis://" + srv.Addr() + "/0")
	if err != nil {
		t.Fatalf("NewRedisClient() error = %v", err)
	}
	t.Cleanup(func() { _ = c.Close() })

	if err := c.Ping(context.Background()); err != nil {
		t.Fatalf("Ping() error = %v", err)
	}
}

func TestPingFailsWhenServerIsDown(t *testing.T) {
	srv := miniredis.RunT(t)
	addr := srv.Addr()
	srv.Close()

	c, err := NewRedisClient("redis://" + addr + "/0")
	if err != nil {
		t.Fatalf("NewRedisClient() error = %v", err)
	}
	t.Cleanup(func() { _ = c.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := c.Ping(ctx); err == nil {
		t.Fatal("expected Ping() to fail when server is down")
	}
}
