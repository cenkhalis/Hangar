package pipeline

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"

	"github.com/cenkhalis/hangar/ingest/internal/inbox"
	"github.com/cenkhalis/hangar/ingest/internal/message"
	"github.com/cenkhalis/hangar/ingest/internal/queue"
	"github.com/cenkhalis/hangar/ingest/internal/validator"
)

var fixedNow = time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC)

type fakePublisher struct {
	mu   sync.Mutex
	msgs []message.FlightLog
	err  error
}

func (p *fakePublisher) PublishFlightLog(_ context.Context, msg message.FlightLog) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.err != nil {
		return "", p.err
	}
	p.msgs = append(p.msgs, msg)
	return fmt.Sprintf("%d-0", len(p.msgs)), nil
}

// validCSV returns a single-sortie log; offset shifts timestamps so contents (and log IDs) differ.
func validCSV(serial string, offset int) string {
	var b strings.Builder
	b.WriteString("timestamp,aircraft_serial,lat,lon,alt_agl_m,speed_mps,battery_pct\n")
	alts := []float64{0, 20, 60, 20, 0}
	start := time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC).Add(time.Duration(offset) * time.Hour)
	for i, alt := range alts {
		fmt.Fprintf(&b, "%s,%s,41.%04d,29.0,%v,10,%d\n",
			start.Add(time.Duration(i)*time.Second).Format(time.RFC3339), serial, i, alt, 99-i)
	}
	return b.String()
}

func newProcessor(pub queue.FlightLogPublisher) *Processor {
	return &Processor{Publisher: pub, Validator: validator.DefaultConfig(), Now: func() time.Time { return fixedNow }}
}

func writeFile(t *testing.T, dir, name, content string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestProcessFilePublishesSummary(t *testing.T) {
	pub := &fakePublisher{}
	path := writeFile(t, t.TempDir(), "AC-1.csv", validCSV("AC-1", 0))

	msg, err := newProcessor(pub).ProcessFile(context.Background(), path, "AC-1.csv")
	if err != nil {
		t.Fatal(err)
	}

	if len(pub.msgs) != 1 {
		t.Fatalf("published %d messages", len(pub.msgs))
	}
	if msg.AircraftSerial != "AC-1" || msg.Telemetry.SampleCount != 5 || msg.Telemetry.MaxAltitudeM != 60 {
		t.Errorf("unexpected message %+v", msg)
	}
	if msg.ArrivalAt.Sub(msg.DepartureAt) != 2*time.Second {
		t.Errorf("duration = %v", msg.ArrivalAt.Sub(msg.DepartureAt))
	}
	if msg.Source != (message.Source{Filename: "AC-1.csv", Format: "csv", IngestedAt: fixedNow}) {
		t.Errorf("source = %+v", msg.Source)
	}
	if len(msg.LogID) != 64 {
		t.Errorf("LogID = %q", msg.LogID)
	}
}

func TestProcessFileErrorsAreClassified(t *testing.T) {
	dir := t.TempDir()
	tests := []struct {
		name      string
		file      string
		content   string
		pubErr    error
		permanent bool
	}{
		{"malformed", "bad.csv", "timestamp\nnope\n", nil, true},
		{"invalid", "ground.csv", strings.ReplaceAll(validCSV("AC-1", 0), ",60,", ",0,"), nil, true},
		{"unknown extension", "x.txt", "", nil, true},
		{"redis down", "ok.csv", validCSV("AC-1", 0), errors.New("connection refused"), false},
		{"missing file", "missing.csv", "", nil, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(dir, tt.file)
			if tt.name != "missing file" {
				writeFile(t, dir, tt.file, tt.content)
			}
			_, err := newProcessor(&fakePublisher{err: tt.pubErr}).ProcessFile(context.Background(), path, tt.file)
			if err == nil {
				t.Fatal("expected error")
			}
			if IsPermanent(err) != tt.permanent {
				t.Errorf("IsPermanent(%v) = %v, want %v", err, IsPermanent(err), tt.permanent)
			}
		})
	}
}

func newRunner(t *testing.T, pub queue.FlightLogPublisher) (*Runner, string) {
	t.Helper()
	root := t.TempDir()
	box, err := inbox.New(root, 0)
	if err != nil {
		t.Fatal(err)
	}
	return &Runner{
		Inbox:        box,
		Processor:    newProcessor(pub),
		Workers:      4,
		PollInterval: 10 * time.Millisecond,
		FileTimeout:  5 * time.Second,
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
	}, root
}

func count(t *testing.T, dir string) int {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	return len(entries)
}

func TestPollOnceProcessesManyFilesConcurrentlyExactlyOnce(t *testing.T) {
	pub := &fakePublisher{}
	r, root := newRunner(t, pub)
	const files = 50
	for i := range files {
		writeFile(t, filepath.Join(root, inbox.DirInbox), fmt.Sprintf("log-%02d.csv", i), validCSV("AC-1", i))
	}

	stats, err := r.PollOnce(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if stats.Published != files || len(pub.msgs) != files {
		t.Fatalf("stats %+v, published %d", stats, len(pub.msgs))
	}
	seen := map[string]bool{}
	for _, m := range pub.msgs {
		if seen[m.LogID] {
			t.Errorf("log %s published twice", m.LogID)
		}
		seen[m.LogID] = true
	}
	if n := count(t, filepath.Join(root, inbox.DirProcessed)); n != files {
		t.Errorf("processed/ has %d files", n)
	}
	if n := count(t, filepath.Join(root, inbox.DirProcessing)); n != 0 {
		t.Errorf("processing/ has %d files", n)
	}
}

func TestPollOnceRoutesFailuresAndTransientErrors(t *testing.T) {
	pub := &fakePublisher{}
	r, root := newRunner(t, pub)
	in := filepath.Join(root, inbox.DirInbox)
	writeFile(t, in, "good.csv", validCSV("AC-1", 0))
	writeFile(t, in, "bad.json", `{"samples": [}`)

	stats, err := r.PollOnce(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if stats.Published != 1 || stats.Failed != 1 {
		t.Errorf("stats = %+v", stats)
	}
	if _, err := os.Stat(filepath.Join(root, inbox.DirFailed, "bad.json.error.txt")); err != nil {
		t.Errorf("missing error file: %v", err)
	}

	pub.err = errors.New("redis down")
	writeFile(t, in, "later.csv", validCSV("AC-1", 1))
	stats, _ = r.PollOnce(context.Background())
	if stats.Released != 1 {
		t.Errorf("stats = %+v, want 1 released", stats)
	}
	if _, err := os.Stat(filepath.Join(in, "later.csv")); err != nil {
		t.Errorf("released file not back in inbox: %v", err)
	}
}

func TestRunRecoversThenPollsUntilCancelled(t *testing.T) {
	pub := &fakePublisher{}
	r, root := newRunner(t, pub)
	writeFile(t, filepath.Join(root, inbox.DirProcessing), "interrupted.csv", validCSV("AC-1", 0))

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- r.Run(ctx) }()

	deadline := time.Now().Add(2 * time.Second)
	for count(t, filepath.Join(root, inbox.DirProcessed)) == 0 {
		if time.Now().After(deadline) {
			t.Fatal("interrupted file was not processed")
		}
		time.Sleep(5 * time.Millisecond)
	}
	cancel()
	if err := <-done; err != nil {
		t.Errorf("Run() = %v", err)
	}
}

// TestPipelineToRedisStream checks the real publisher end to end: inbox files become stream
// entries that carry the v1 contract fields.
func TestPipelineToRedisStream(t *testing.T) {
	srv := miniredis.RunT(t)
	client, err := queue.NewRedisClient("redis://" + srv.Addr() + "/0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Close() })
	r, root := newRunner(t, client)
	writeFile(t, filepath.Join(root, inbox.DirInbox), "a.csv", validCSV("AC-1", 0))
	writeFile(t, filepath.Join(root, inbox.DirInbox), "b.csv", validCSV("AC-2", 0))

	if _, err := r.PollOnce(context.Background()); err != nil {
		t.Fatal(err)
	}

	entries, err := srv.Stream(queue.FlightLogStream)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("stream has %d entries, want 2", len(entries))
	}
	for _, e := range entries {
		if e.Values[0] != "payload" && e.Values[0] != "schema_version" {
			t.Errorf("unexpected fields %v", e.Values)
		}
	}
}
