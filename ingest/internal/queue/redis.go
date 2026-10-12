// Package queue provides the Redis connection used to publish parsed flight logs.
package queue

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// Client is the queue abstraction consumed by the rest of the service.
type Client interface {
	Ping(ctx context.Context) error
	Close() error
}

// RedisClient implements Client on top of go-redis.
type RedisClient struct {
	rdb *redis.Client
}

// NewRedisClient creates a client from a redis:// URL. It does not dial until first use.
func NewRedisClient(url string) (*RedisClient, error) {
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	return &RedisClient{rdb: redis.NewClient(opts)}, nil
}

// Ping verifies that Redis is reachable.
func (c *RedisClient) Ping(ctx context.Context) error {
	if err := c.rdb.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("redis ping: %w", err)
	}
	return nil
}

// Close releases the underlying connection pool.
func (c *RedisClient) Close() error {
	return c.rdb.Close()
}
