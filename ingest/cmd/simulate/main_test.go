package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cenkhalis/hangar/ingest/internal/parser"
	"github.com/cenkhalis/hangar/ingest/internal/validator"
)

func TestRunWritesValidLogs(t *testing.T) {
	for _, format := range []string{"csv", "json"} {
		t.Run(format, func(t *testing.T) {
			dir := t.TempDir()
			var out bytes.Buffer

			err := run([]string{
				"-serial", "AC-00001", "-count", "3", "-format", format, "-out", dir,
				"-start", "2026-10-01T06:00:00Z", "-cruise", "2m", "-in-air",
			}, &out)
			if err != nil {
				t.Fatal(err)
			}

			paths := strings.Fields(out.String())
			if len(paths) != 3 {
				t.Fatalf("printed %v", paths)
			}
			if filepath.Base(paths[0]) != "AC-00001_20261001T060000Z."+format ||
				filepath.Base(paths[1]) != "AC-00001_20261001T080000Z."+format {
				t.Errorf("unexpected names %v", paths)
			}
			entries, _ := os.ReadDir(dir)
			if len(entries) != 3 {
				t.Errorf("directory has %d entries (temp files left behind?)", len(entries))
			}
			ids := map[string]bool{}
			for _, p := range paths {
				f, err := os.Open(p)
				if err != nil {
					t.Fatal(err)
				}
				res, err := parser.Parse(f, parser.Format(format))
				_ = f.Close()
				if err != nil {
					t.Fatal(err)
				}
				if err := validator.Validate(res.Samples, validator.DefaultConfig()); err != nil {
					t.Errorf("%s invalid: %v", p, err)
				}
				ids[res.LogID] = true
			}
			if len(ids) != 3 {
				t.Error("flights should have distinct contents")
			}
		})
	}
}

func TestRunRejectsBadFlags(t *testing.T) {
	for name, args := range map[string][]string{
		"missing serial": {},
		"bad format":     {"-serial", "A", "-format", "xml"},
		"bad count":      {"-serial", "A", "-count", "0"},
		"bad start":      {"-serial", "A", "-start", "tomorrow"},
	} {
		t.Run(name, func(t *testing.T) {
			if err := run(append(args, "-out", t.TempDir()), &bytes.Buffer{}); err == nil {
				t.Error("expected error")
			}
		})
	}
}
