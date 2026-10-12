package config

import (
	"runtime"
	"testing"
	"time"
)

func envFrom(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func defaults(redisURL string) Config {
	return Config{
		RedisURL:          redisURL,
		ShutdownTimeout:   defaultShutdownTimeout,
		InboxDir:          defaultInboxDir,
		PollInterval:      defaultPollInterval,
		InboxSettle:       defaultInboxSettle,
		Workers:           runtime.NumCPU(),
		AirborneAltitudeM: defaultAirborneAltitudeM,
	}
}

func TestLoad(t *testing.T) {
	custom := defaults("redis://r:6379/0")
	custom.ShutdownTimeout = 3 * time.Second
	custom.InboxDir = "/tmp/logs"
	custom.PollInterval = 500 * time.Millisecond
	custom.InboxSettle = 0
	custom.Workers = 3
	custom.AirborneAltitudeM = 2.5

	tests := []struct {
		name    string
		env     map[string]string
		want    Config
		wantErr bool
	}{
		{name: "defaults", env: map[string]string{"REDIS_URL": "redis://localhost:6379/0"}, want: defaults("redis://localhost:6379/0")},
		{
			name: "all overrides",
			env: map[string]string{
				"REDIS_URL": "redis://r:6379/0", "SHUTDOWN_TIMEOUT": "3s", "INBOX_DIR": "/tmp/logs",
				"POLL_INTERVAL": "500ms", "INBOX_SETTLE": "0s", "INGEST_WORKERS": "3", "AIRBORNE_ALTITUDE_M": "2.5",
			},
			want: custom,
		},
		{name: "missing redis url", env: map[string]string{}, wantErr: true},
		{name: "malformed shutdown timeout", env: map[string]string{"REDIS_URL": "x", "SHUTDOWN_TIMEOUT": "soon"}, wantErr: true},
		{name: "zero shutdown timeout", env: map[string]string{"REDIS_URL": "x", "SHUTDOWN_TIMEOUT": "0s"}, wantErr: true},
		{name: "zero poll interval", env: map[string]string{"REDIS_URL": "x", "POLL_INTERVAL": "0s"}, wantErr: true},
		{name: "negative settle", env: map[string]string{"REDIS_URL": "x", "INBOX_SETTLE": "-1s"}, wantErr: true},
		{name: "zero workers", env: map[string]string{"REDIS_URL": "x", "INGEST_WORKERS": "0"}, wantErr: true},
		{name: "non-numeric workers", env: map[string]string{"REDIS_URL": "x", "INGEST_WORKERS": "many"}, wantErr: true},
		{name: "negative altitude", env: map[string]string{"REDIS_URL": "x", "AIRBORNE_ALTITUDE_M": "-1"}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Load(envFrom(tt.env))
			if (err != nil) != tt.wantErr {
				t.Fatalf("Load() error = %v, wantErr %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("Load() = %+v, want %+v", got, tt.want)
			}
		})
	}
}
