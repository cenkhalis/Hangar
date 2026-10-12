// Command ingest runs the HANGAR flight log ingestion service.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cenkhalis/hangar/ingest/internal/config"
	"github.com/cenkhalis/hangar/ingest/internal/queue"
)

const startupPingTimeout = 5 * time.Second

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	err := run(ctx, os.Getenv, logger)
	stop()

	if err != nil {
		logger.Error("ingest service failed", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, getenv func(string) string, logger *slog.Logger) error {
	cfg, err := config.Load(getenv)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	q, err := queue.NewRedisClient(cfg.RedisURL)
	if err != nil {
		return err
	}
	defer func() {
		if err := q.Close(); err != nil {
			logger.Warn("closing redis client", "error", err)
		}
	}()

	pingCtx, cancel := context.WithTimeout(ctx, startupPingTimeout)
	defer cancel()
	if err := q.Ping(pingCtx); err != nil {
		if ctx.Err() != nil {
			logger.Info("shutdown requested during startup")
			return nil
		}
		return err
	}

	logger.Info("ingest service started")
	<-ctx.Done()
	logger.Info("shutdown signal received")
	return nil
}
