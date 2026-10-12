package queue

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/redis/go-redis/v9"

	"github.com/cenkhalis/hangar/ingest/internal/message"
)

// Stream settings from contracts/flight-log/v1.
const (
	FlightLogStream       = "hangar:flight-logs:v1"
	flightLogStreamMaxLen = 100_000
)

// FlightLogPublisher publishes flight log messages.
type FlightLogPublisher interface {
	PublishFlightLog(ctx context.Context, msg message.FlightLog) (string, error)
}

// PublishFlightLog appends the message to the flight log stream and returns the entry ID.
func (c *RedisClient) PublishFlightLog(ctx context.Context, msg message.FlightLog) (string, error) {
	payload, err := json.Marshal(msg)
	if err != nil {
		return "", fmt.Errorf("encode flight log: %w", err)
	}
	id, err := c.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: FlightLogStream,
		MaxLen: flightLogStreamMaxLen,
		Approx: true,
		Values: map[string]any{
			"schema_version": message.SchemaVersion,
			"payload":        string(payload),
		},
	}).Result()
	if err != nil {
		return "", fmt.Errorf("publish flight log: %w", err)
	}
	return id, nil
}
