// Package inbox manages the flight log drop directory and the lifecycle of each file:
// inbox/ -> processing/ -> processed/ or failed/.
package inbox

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/cenkhalis/hangar/ingest/internal/parser"
)

// Subdirectories of the inbox root.
const (
	DirInbox      = "inbox"
	DirProcessing = "processing"
	DirProcessed  = "processed"
	DirFailed     = "failed"
)

// Inbox is a directory-based work queue. Files are claimed by atomic rename, so concurrent
// claimers never process the same file twice.
type Inbox struct {
	root   string
	settle time.Duration
	now    func() time.Time
}

// File is a claimed log file, currently in processing/.
type File struct {
	Name string
	Path string
}

// New creates the directory layout under root. Files modified less than settle ago are not
// claimed, so partially written files are left alone.
func New(root string, settle time.Duration) (*Inbox, error) {
	for _, dir := range []string{DirInbox, DirProcessing, DirProcessed, DirFailed} {
		if err := os.MkdirAll(filepath.Join(root, dir), 0o755); err != nil {
			return nil, fmt.Errorf("create %s directory: %w", dir, err)
		}
	}
	return &Inbox{root: root, settle: settle, now: time.Now}, nil
}

func (b *Inbox) dir(name string) string { return filepath.Join(b.root, name) }

// Recover moves files left in processing/ (e.g. after a crash) back to inbox/.
func (b *Inbox) Recover() (int, error) {
	entries, err := os.ReadDir(b.dir(DirProcessing))
	if err != nil {
		return 0, fmt.Errorf("read processing directory: %w", err)
	}
	moved := 0
	for _, e := range entries {
		if !e.Type().IsRegular() {
			continue
		}
		if err := moveUnique(filepath.Join(b.dir(DirProcessing), e.Name()), b.dir(DirInbox), e.Name()); err != nil {
			return moved, err
		}
		moved++
	}
	return moved, nil
}

// Claim moves every eligible file from inbox/ to processing/ and returns them. Hidden files,
// directories, unsupported extensions and files still being written are skipped.
func (b *Inbox) Claim() ([]File, error) {
	entries, err := os.ReadDir(b.dir(DirInbox))
	if err != nil {
		return nil, fmt.Errorf("read inbox: %w", err)
	}
	cutoff := b.now().Add(-b.settle)
	var claimed []File
	for _, e := range entries {
		name := e.Name()
		if !e.Type().IsRegular() || strings.HasPrefix(name, ".") {
			continue
		}
		if _, err := parser.FormatFromPath(name); err != nil {
			continue
		}
		info, err := e.Info()
		if err != nil || info.ModTime().After(cutoff) {
			continue
		}
		dst := filepath.Join(b.dir(DirProcessing), name)
		if err := os.Rename(filepath.Join(b.dir(DirInbox), name), dst); err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				continue // claimed by someone else
			}
			return claimed, fmt.Errorf("claim %s: %w", name, err)
		}
		claimed = append(claimed, File{Name: name, Path: dst})
	}
	return claimed, nil
}

// Complete archives a successfully published file in processed/.
func (b *Inbox) Complete(f File) error {
	return moveUnique(f.Path, b.dir(DirProcessed), f.Name)
}

// Fail moves a permanently invalid file to failed/ with a sibling <name>.error.txt.
func (b *Inbox) Fail(f File, cause error) error {
	dst, err := uniquePath(b.dir(DirFailed), f.Name)
	if err != nil {
		return err
	}
	if err := os.Rename(f.Path, dst); err != nil {
		return fmt.Errorf("move %s to failed: %w", f.Name, err)
	}
	if err := os.WriteFile(dst+".error.txt", []byte(cause.Error()+"\n"), 0o644); err != nil {
		return fmt.Errorf("write error file for %s: %w", f.Name, err)
	}
	return nil
}

// Release returns a file to inbox/ for a later retry after a transient failure.
func (b *Inbox) Release(f File) error {
	return moveUnique(f.Path, b.dir(DirInbox), f.Name)
}

func moveUnique(src, dir, name string) error {
	dst, err := uniquePath(dir, name)
	if err != nil {
		return err
	}
	if err := os.Rename(src, dst); err != nil {
		return fmt.Errorf("move %s to %s: %w", name, filepath.Base(dir), err)
	}
	return nil
}

// uniquePath returns dir/name, or dir/<stem>-N<ext> if that already exists, so archived files
// with the same name are never overwritten.
func uniquePath(dir, name string) (string, error) {
	ext := filepath.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	for n := 0; n < 10_000; n++ {
		candidate := name
		if n > 0 {
			candidate = fmt.Sprintf("%s-%d%s", stem, n, ext)
		}
		path := filepath.Join(dir, candidate)
		if _, err := os.Lstat(path); errors.Is(err, fs.ErrNotExist) {
			return path, nil
		} else if err != nil {
			return "", fmt.Errorf("stat %s: %w", path, err)
		}
	}
	return "", fmt.Errorf("no free file name for %s in %s", name, dir)
}
