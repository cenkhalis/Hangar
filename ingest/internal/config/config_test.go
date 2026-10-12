package config

import (
	"testing"
	"time"
)

func envFrom(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoad(t *testing.T) {
	tests := []struct {
		name    string
		env     map[string]string
		want    Config
		wantErr bool
	}{
		{
			name: "defaults",
			env:  map[string]string{"REDIS_URL": "redis://localhost:6379/0"},
			want: Config{RedisURL: "redis://localhost:6379/0", ShutdownTimeout: defaultShutdownTimeout},
		},
		{
			name: "custom shutdown timeout",
			env:  map[string]string{"REDIS_URL": "redis://r:6379/0", "SHUTDOWN_TIMEOUT": "3s"},
			want: Config{RedisURL: "redis://r:6379/0", ShutdownTimeout: 3 * time.Second},
		},
		{name: "missing redis url", env: map[string]string{}, wantErr: true},
		{
			name:    "malformed shutdown timeout",
			env:     map[string]string{"REDIS_URL": "redis://r:6379/0", "SHUTDOWN_TIMEOUT": "soon"},
			wantErr: true,
		},
		{
			name:    "non-positive shutdown timeout",
			env:     map[string]string{"REDIS_URL": "redis://r:6379/0", "SHUTDOWN_TIMEOUT": "0s"},
			wantErr: true,
		},
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
