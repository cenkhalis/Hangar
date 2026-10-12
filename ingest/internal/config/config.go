// Package config loads the ingest service configuration from the environment.
package config

import (
	"errors"
	"fmt"
	"runtime"
	"strconv"
	"time"
)

// Config holds the runtime configuration of the ingest service.
type Config struct {
	RedisURL          string
	ShutdownTimeout   time.Duration
	InboxDir          string
	PollInterval      time.Duration
	InboxSettle       time.Duration
	Workers           int
	AirborneAltitudeM float64
}

const (
	defaultShutdownTimeout   = 10 * time.Second
	defaultInboxDir          = "/data/flight-logs"
	defaultPollInterval      = 2 * time.Second
	defaultInboxSettle       = 2 * time.Second
	defaultAirborneAltitudeM = 1.0
)

// Load builds a Config using the given lookup function (typically os.Getenv).
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		RedisURL:          getenv("REDIS_URL"),
		ShutdownTimeout:   defaultShutdownTimeout,
		InboxDir:          defaultInboxDir,
		PollInterval:      defaultPollInterval,
		InboxSettle:       defaultInboxSettle,
		Workers:           runtime.NumCPU(),
		AirborneAltitudeM: defaultAirborneAltitudeM,
	}
	if cfg.RedisURL == "" {
		return Config{}, errors.New("REDIS_URL is required")
	}
	if v := getenv("INBOX_DIR"); v != "" {
		cfg.InboxDir = v
	}

	durations := []struct {
		key       string
		dst       *time.Duration
		allowZero bool
	}{
		{"SHUTDOWN_TIMEOUT", &cfg.ShutdownTimeout, false},
		{"POLL_INTERVAL", &cfg.PollInterval, false},
		{"INBOX_SETTLE", &cfg.InboxSettle, true},
	}
	for _, d := range durations {
		raw := getenv(d.key)
		if raw == "" {
			continue
		}
		v, err := time.ParseDuration(raw)
		if err != nil {
			return Config{}, fmt.Errorf("invalid %s %q: %w", d.key, raw, err)
		}
		if v < 0 || (v == 0 && !d.allowZero) {
			return Config{}, fmt.Errorf("%s must be positive, got %s", d.key, v)
		}
		*d.dst = v
	}

	if raw := getenv("INGEST_WORKERS"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 {
			return Config{}, fmt.Errorf("INGEST_WORKERS must be a positive integer, got %q", raw)
		}
		cfg.Workers = n
	}
	if raw := getenv("AIRBORNE_ALTITUDE_M"); raw != "" {
		v, err := strconv.ParseFloat(raw, 64)
		if err != nil || v < 0 {
			return Config{}, fmt.Errorf("AIRBORNE_ALTITUDE_M must be a non-negative number, got %q", raw)
		}
		cfg.AirborneAltitudeM = v
	}
	return cfg, nil
}
