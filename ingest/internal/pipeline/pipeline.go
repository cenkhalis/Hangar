// Package pipeline turns claimed inbox files into published flight log messages.
package pipeline

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"sync/atomic"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/cenkhalis/hangar/ingest/internal/inbox"
	"github.com/cenkhalis/hangar/ingest/internal/message"
	"github.com/cenkhalis/hangar/ingest/internal/parser"
	"github.com/cenkhalis/hangar/ingest/internal/queue"
	"github.com/cenkhalis/hangar/ingest/internal/summary"
	"github.com/cenkhalis/hangar/ingest/internal/validator"
)

// PermanentError marks a file that can never be published (malformed or invalid log).
type PermanentError struct{ Err error }

func (e *PermanentError) Error() string { return e.Err.Error() }
func (e *PermanentError) Unwrap() error { return e.Err }

// IsPermanent reports whether err is a PermanentError.
func IsPermanent(err error) bool {
	var pe *PermanentError
	return errors.As(err, &pe)
}

// Processor parses, validates, summarizes and publishes a single log file.
type Processor struct {
	Publisher queue.FlightLogPublisher
	Validator validator.Config
	Now       func() time.Time
}

// ProcessFile publishes the log at path. Errors about the log's content are PermanentError;
// anything else (I/O, Redis) is transient.
func (p *Processor) ProcessFile(ctx context.Context, path, name string) (message.FlightLog, error) {
	format, err := parser.FormatFromPath(name)
	if err != nil {
		return message.FlightLog{}, &PermanentError{err}
	}
	f, err := os.Open(path)
	if err != nil {
		return message.FlightLog{}, fmt.Errorf("open %s: %w", name, err)
	}
	defer func() { _ = f.Close() }()

	parsed, err := parser.Parse(f, format)
	if err != nil {
		var pe *parser.Error
		if errors.As(err, &pe) {
			return message.FlightLog{}, &PermanentError{err}
		}
		return message.FlightLog{}, err
	}
	if err := validator.Validate(parsed.Samples, p.Validator); err != nil {
		return message.FlightLog{}, &PermanentError{err}
	}
	sum, err := summary.Summarize(parsed.Samples, p.Validator.AirborneAltitudeM)
	if err != nil {
		return message.FlightLog{}, &PermanentError{err}
	}

	msg := message.New(parsed.LogID, sum, message.Source{
		Filename: name, Format: string(format), IngestedAt: p.Now(),
	})
	if _, err := p.Publisher.PublishFlightLog(ctx, msg); err != nil {
		return message.FlightLog{}, err
	}
	return msg, nil
}

// Stats counts file outcomes for one poll.
type Stats struct {
	Published int64
	Failed    int64
	Released  int64
}

// Runner polls the inbox and processes claimed files with a bounded worker pool.
type Runner struct {
	Inbox        *inbox.Inbox
	Processor    *Processor
	Workers      int
	PollInterval time.Duration
	// FileTimeout bounds processing of one file. In-flight files are allowed to finish on
	// shutdown, up to this limit.
	FileTimeout time.Duration
	Logger      *slog.Logger
}

// Run recovers interrupted files, then polls until ctx is cancelled.
func (r *Runner) Run(ctx context.Context) error {
	recovered, err := r.Inbox.Recover()
	if err != nil {
		return err
	}
	if recovered > 0 {
		r.Logger.Info("recovered interrupted files", "count", recovered)
	}
	ticker := time.NewTicker(r.PollInterval)
	defer ticker.Stop()
	for {
		if _, err := r.PollOnce(ctx); err != nil {
			r.Logger.Error("poll failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}

// PollOnce claims every ready file and processes them concurrently.
func (r *Runner) PollOnce(ctx context.Context) (Stats, error) {
	if ctx.Err() != nil {
		return Stats{}, nil
	}
	files, err := r.Inbox.Claim()
	var stats Stats
	g := new(errgroup.Group)
	g.SetLimit(max(1, r.Workers))
	for _, f := range files {
		g.Go(func() error {
			r.handle(ctx, f, &stats)
			return nil
		})
	}
	_ = g.Wait()
	return stats, err
}

func (r *Runner) handle(ctx context.Context, f inbox.File, stats *Stats) {
	fileCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), r.FileTimeout)
	defer cancel()

	msg, err := r.Processor.ProcessFile(fileCtx, f.Path, f.Name)
	log := r.Logger.With("file", f.Name)
	switch {
	case err == nil:
		atomic.AddInt64(&stats.Published, 1)
		log.Info("published flight log", "log_id", msg.LogID, "aircraft", msg.AircraftSerial)
		err = r.Inbox.Complete(f)
	case IsPermanent(err):
		atomic.AddInt64(&stats.Failed, 1)
		log.Warn("rejected flight log", "error", err)
		err = r.Inbox.Fail(f, err)
	default:
		atomic.AddInt64(&stats.Released, 1)
		log.Error("transient failure, will retry", "error", err)
		err = r.Inbox.Release(f)
	}
	if err != nil {
		log.Error("moving file failed", "error", err)
	}
}
