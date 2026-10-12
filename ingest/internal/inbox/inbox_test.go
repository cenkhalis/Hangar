package inbox

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

func newInbox(t *testing.T) (*Inbox, string) {
	t.Helper()
	root := t.TempDir()
	b, err := New(root, 0)
	if err != nil {
		t.Fatal(err)
	}
	return b, root
}

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func list(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)
	return names
}

func TestNewCreatesLayout(t *testing.T) {
	_, root := newInbox(t)

	if got := list(t, root); strings.Join(got, ",") != "failed,inbox,processed,processing" {
		t.Errorf("layout = %v", got)
	}
}

func TestClaimMovesSupportedFilesOnly(t *testing.T) {
	b, root := newInbox(t)
	in := filepath.Join(root, DirInbox)
	for _, name := range []string{"a.csv", "b.JSON", "notes.txt", ".c.csv.tmp", ".hidden.csv"} {
		write(t, filepath.Join(in, name), "x")
	}
	if err := os.Mkdir(filepath.Join(in, "sub.csv"), 0o755); err != nil {
		t.Fatal(err)
	}

	files, err := b.Claim()
	if err != nil {
		t.Fatal(err)
	}

	names := make([]string, len(files))
	for i, f := range files {
		names[i] = f.Name
		if filepath.Dir(f.Path) != filepath.Join(root, DirProcessing) {
			t.Errorf("claimed file path %s not in processing/", f.Path)
		}
	}
	sort.Strings(names)
	if strings.Join(names, ",") != "a.csv,b.JSON" {
		t.Errorf("claimed %v", names)
	}
	if got := list(t, in); strings.Join(got, ",") != ".c.csv.tmp,.hidden.csv,notes.txt,sub.csv" {
		t.Errorf("left in inbox: %v", got)
	}
}

func TestClaimSkipsFilesStillBeingWritten(t *testing.T) {
	root := t.TempDir()
	b, err := New(root, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	fresh := filepath.Join(root, DirInbox, "fresh.csv")
	old := filepath.Join(root, DirInbox, "old.csv")
	write(t, fresh, "x")
	write(t, old, "x")
	past := time.Now().Add(-2 * time.Minute)
	if err := os.Chtimes(old, past, past); err != nil {
		t.Fatal(err)
	}

	files, err := b.Claim()
	if err != nil {
		t.Fatal(err)
	}

	if len(files) != 1 || files[0].Name != "old.csv" {
		t.Errorf("claimed %+v, want only old.csv", files)
	}
}

func TestCompleteFailRelease(t *testing.T) {
	b, root := newInbox(t)
	for _, name := range []string{"ok.csv", "bad.csv", "retry.csv"} {
		write(t, filepath.Join(root, DirInbox, name), name)
	}
	files, err := b.Claim()
	if err != nil {
		t.Fatal(err)
	}
	byName := map[string]File{}
	for _, f := range files {
		byName[f.Name] = f
	}

	if err := b.Complete(byName["ok.csv"]); err != nil {
		t.Fatal(err)
	}
	if err := b.Fail(byName["bad.csv"], errors.New("row 3: field \"lat\": not a number")); err != nil {
		t.Fatal(err)
	}
	if err := b.Release(byName["retry.csv"]); err != nil {
		t.Fatal(err)
	}

	if got := list(t, filepath.Join(root, DirProcessed)); strings.Join(got, ",") != "ok.csv" {
		t.Errorf("processed = %v", got)
	}
	if got := list(t, filepath.Join(root, DirFailed)); strings.Join(got, ",") != "bad.csv,bad.csv.error.txt" {
		t.Errorf("failed = %v", got)
	}
	errText, _ := os.ReadFile(filepath.Join(root, DirFailed, "bad.csv.error.txt"))
	if !strings.Contains(string(errText), "not a number") {
		t.Errorf("error file = %q", errText)
	}
	if got := list(t, filepath.Join(root, DirInbox)); strings.Join(got, ",") != "retry.csv" {
		t.Errorf("inbox = %v", got)
	}
	if got := list(t, filepath.Join(root, DirProcessing)); len(got) != 0 {
		t.Errorf("processing not empty: %v", got)
	}
}

func TestArchiveNeverOverwrites(t *testing.T) {
	b, root := newInbox(t)
	for i := range 3 {
		write(t, filepath.Join(root, DirInbox, "same.csv"), fmt.Sprint(i))
		files, err := b.Claim()
		if err != nil || len(files) != 1 {
			t.Fatalf("Claim() = %v, %v", files, err)
		}
		if err := b.Complete(files[0]); err != nil {
			t.Fatal(err)
		}
	}

	if got := list(t, filepath.Join(root, DirProcessed)); strings.Join(got, ",") != "same-1.csv,same-2.csv,same.csv" {
		t.Errorf("processed = %v", got)
	}
}

func TestRecoverMovesProcessingBackToInbox(t *testing.T) {
	b, root := newInbox(t)
	write(t, filepath.Join(root, DirProcessing, "crashed.csv"), "x")

	n, err := b.Recover()
	if err != nil || n != 1 {
		t.Fatalf("Recover() = %d, %v", n, err)
	}
	if got := list(t, filepath.Join(root, DirInbox)); strings.Join(got, ",") != "crashed.csv" {
		t.Errorf("inbox = %v", got)
	}
}

func TestConcurrentClaimersNeverShareAFile(t *testing.T) {
	b, root := newInbox(t)
	const files = 200
	for i := range files {
		write(t, filepath.Join(root, DirInbox, fmt.Sprintf("log-%03d.csv", i)), "x")
	}

	var (
		mu      sync.Mutex
		claimed = map[string]int{}
		wg      sync.WaitGroup
	)
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			got, err := b.Claim()
			if err != nil {
				t.Error(err)
				return
			}
			mu.Lock()
			defer mu.Unlock()
			for _, f := range got {
				claimed[f.Name]++
			}
		}()
	}
	wg.Wait()

	if len(claimed) != files {
		t.Errorf("claimed %d distinct files, want %d", len(claimed), files)
	}
	for name, n := range claimed {
		if n != 1 {
			t.Errorf("%s claimed %d times", name, n)
		}
	}
}
