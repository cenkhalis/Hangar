// Package config loads the ingest service configuration from the environment.
package config

import (
	"errors"
	"fmt"
	"time"
)

// Config holds the runtime configuration of the ingest service.
type Config struct {
	RedisURL        string
	ShutdownTimeout time.Duration
}

const defaultShutdownTimeout = 10 * time.Second

// Load builds a Config using the given lookup function (typically os.Getenv).
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		RedisURL:        getenv("REDIS_URL"),
		ShutdownTimeout: defaultShutdownTimeout,
	}
	if cfg.RedisURL == "" {
		return Config{}, errors.New("REDIS_URL is required")
	}
	if raw := getenv("SHUTDOWN_TIMEOUT"); raw != "" {
		d, err := time.ParseDuration(raw)
		if err != nil {
			return Config{}, fmt.Errorf("invalid SHUTDOWN_TIMEOUT %q: %w", raw, err)
		}
		if d <= 0 {
			return Config{}, fmt.Errorf("SHUTDOWN_TIMEOUT must be positive, got %s", d)
		}
		cfg.ShutdownTimeout = d
	}
	return cfg, nil
}
