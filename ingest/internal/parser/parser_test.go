package parser

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"
	"testing/iotest"
	"time"
)

const csvHeader = "timestamp,aircraft_serial,lat,lon,alt_agl_m,speed_mps,battery_pct\n"

const validCSV = csvHeader +
	"2026-10-12T08:00:00Z,AC-1,41.0,29.0,0,0,99.5\n" +
	"2026-10-12T08:00:01Z,AC-1,41.0001,29.0001,5.5,3.2,99.4\n"

const validJSON = `{
  "meta": {"ignored": [1, 2, {"x": true}]},
  "samples": [
    {"timestamp": "2026-10-12T08:00:00Z", "aircraft_serial": "AC-1", "lat": 41.0, "lon": 29.0,
     "alt_agl_m": 0, "speed_mps": 0, "battery_pct": 99.5},
    {"timestamp": "2026-10-12T08:00:01+03:00", "aircraft_serial": " AC-1 ", "lat": 41.0001,
     "lon": 29.0001, "alt_agl_m": 5.5, "speed_mps": 3.2, "battery_pct": 99.4, "in_air": true}
  ]
}`

func sha(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func mustParse(t *testing.T, input string, f Format) Result {
	t.Helper()
	res, err := Parse(strings.NewReader(input), f)
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	return res
}

func TestParseCSV(t *testing.T) {
	res := mustParse(t, validCSV, CSV)

	if len(res.Samples) != 2 {
		t.Fatalf("got %d samples, want 2", len(res.Samples))
	}
	s := res.Samples[1]
	if !s.Timestamp.Equal(time.Date(2026, 10, 12, 8, 0, 1, 0, time.UTC)) {
		t.Errorf("Timestamp = %v", s.Timestamp)
	}
	if s.AircraftSerial != "AC-1" || s.Lat != 41.0001 || s.Lon != 29.0001 ||
		s.AltAGLM != 5.5 || s.SpeedMPS != 3.2 || s.BatteryPct != 99.4 || s.InAir != nil {
		t.Errorf("unexpected sample %+v", s)
	}
	if res.LogID != sha(validCSV) {
		t.Errorf("LogID = %s, want sha256 of input", res.LogID)
	}
}

func TestParseCSVColumnOrderBOMAndCRLF(t *testing.T) {
	input := "\xEF\xBB\xBFbattery_pct,timestamp,lat,lon,alt_agl_m,speed_mps,aircraft_serial\r\n" +
		"88,2026-10-12T08:00:00Z,41,29,2,1,AC-9\r\n"

	res := mustParse(t, input, CSV)

	if s := res.Samples[0]; s.BatteryPct != 88 || s.AircraftSerial != "AC-9" {
		t.Errorf("unexpected sample %+v", s)
	}
}

func TestParseCSVOptionalInAir(t *testing.T) {
	input := "timestamp,aircraft_serial,lat,lon,alt_agl_m,speed_mps,battery_pct,in_air\n" +
		"2026-10-12T08:00:00Z,AC-1,41,29,0,0,99,false\n" +
		"2026-10-12T08:00:01Z,AC-1,41,29,0.5,0,99,true\n" +
		"2026-10-12T08:00:02Z,AC-1,41,29,3,0,99,\n"

	res := mustParse(t, input, CSV)

	if got := res.Samples[0].InAir; got == nil || *got {
		t.Errorf("sample 0 InAir = %v, want false", got)
	}
	if got := res.Samples[1].InAir; got == nil || !*got {
		t.Errorf("sample 1 InAir = %v, want true", got)
	}
	if got := res.Samples[2].InAir; got != nil {
		t.Errorf("sample 2 InAir = %v, want nil (empty cell)", *got)
	}
}

func TestParseCSVHeaderOnly(t *testing.T) {
	if res := mustParse(t, csvHeader, CSV); len(res.Samples) != 0 {
		t.Errorf("got %d samples, want 0", len(res.Samples))
	}
}

func TestParseJSON(t *testing.T) {
	res := mustParse(t, validJSON, JSON)

	if len(res.Samples) != 2 {
		t.Fatalf("got %d samples, want 2", len(res.Samples))
	}
	s := res.Samples[1]
	if !s.Timestamp.Equal(time.Date(2026, 10, 12, 5, 0, 1, 0, time.UTC)) || s.Timestamp.Location() != time.UTC {
		t.Errorf("Timestamp = %v, want converted to UTC", s.Timestamp)
	}
	if s.AircraftSerial != "AC-1" || s.InAir == nil || !*s.InAir {
		t.Errorf("unexpected sample %+v", s)
	}
	if res.Samples[0].InAir != nil {
		t.Error("absent in_air should be nil")
	}
	if res.LogID != sha(validJSON) {
		t.Error("LogID should be the sha256 of the raw input")
	}
}

func TestParseErrors(t *testing.T) {
	tests := []struct {
		name      string
		format    Format
		input     string
		wantRow   int
		wantField string
	}{
		{"empty csv", CSV, "", 0, ""},
		{"missing column", CSV, "timestamp,aircraft_serial,lat,lon,alt_agl_m,speed_mps\n", 1, "battery_pct"},
		{"bad float", CSV, csvHeader + "2026-10-12T08:00:00Z,AC-1,41,29,0,0,99\n2026-10-12T08:00:01Z,AC-1,abc,29,0,0,99\n", 3, "lat"},
		{"bad timestamp", CSV, csvHeader + "12/10/2026,AC-1,41,29,0,0,99\n", 2, "timestamp"},
		{"bad in_air", CSV, "timestamp,aircraft_serial,lat,lon,alt_agl_m,speed_mps,battery_pct,in_air\n2026-10-12T08:00:00Z,AC-1,41,29,0,0,99,maybe\n", 2, "in_air"},
		{"wrong field count", CSV, csvHeader + "2026-10-12T08:00:00Z,AC-1,41\n", 2, ""},
		{"json not an object", JSON, `[1, 2]`, 0, ""},
		{"json missing samples", JSON, `{"other": []}`, 0, "samples"},
		{"json samples not array", JSON, `{"samples": {}}`, 0, ""},
		{"json missing field", JSON, `{"samples": [{"timestamp": "2026-10-12T08:00:00Z", "aircraft_serial": "A", "lat": 1, "lon": 1, "alt_agl_m": 1, "speed_mps": 1}]}`, 1, "battery_pct"},
		{"json wrong type", JSON, `{"samples": [{"lat": "north"}]}`, 1, ""},
		{"json truncated", JSON, `{"samples": [{"lat": 1`, 0, ""},
		{"json empty", JSON, ``, 0, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Parse(strings.NewReader(tt.input), tt.format)
			var pe *Error
			if !errors.As(err, &pe) {
				t.Fatalf("Parse() error = %v, want *parser.Error", err)
			}
			if tt.wantRow != 0 && pe.Row != tt.wantRow {
				t.Errorf("Row = %d, want %d (%v)", pe.Row, tt.wantRow, pe)
			}
			if pe.Field != tt.wantField {
				t.Errorf("Field = %q, want %q (%v)", pe.Field, tt.wantField, pe)
			}
		})
	}
}

func TestParseUnknownFormat(t *testing.T) {
	if _, err := Parse(strings.NewReader(""), Format("xml")); !errors.Is(err, ErrUnknownFormat) {
		t.Errorf("error = %v, want ErrUnknownFormat", err)
	}
}

func TestFormatFromPath(t *testing.T) {
	for path, want := range map[string]Format{"a.csv": CSV, "B.CSV": CSV, "dir/x.json": JSON} {
		if got, err := FormatFromPath(path); err != nil || got != want {
			t.Errorf("FormatFromPath(%q) = %q, %v", path, got, err)
		}
	}
	for _, path := range []string{"a.txt", "noext", "a.csv.tmp"} {
		if _, err := FormatFromPath(path); !errors.Is(err, ErrUnknownFormat) {
			t.Errorf("FormatFromPath(%q) error = %v, want ErrUnknownFormat", path, err)
		}
	}
}

func TestLogIDCoversTrailingBytesAndIsChunkingIndependent(t *testing.T) {
	input := validJSON + "\n\n   \n"

	whole := mustParse(t, input, JSON)
	chunked, err := Parse(iotest.OneByteReader(strings.NewReader(input)), JSON)
	if err != nil {
		t.Fatal(err)
	}

	if whole.LogID != sha(input) || chunked.LogID != whole.LogID {
		t.Errorf("LogID mismatch: whole=%s chunked=%s want=%s", whole.LogID, chunked.LogID, sha(input))
	}
	if other := mustParse(t, input+" ", JSON); other.LogID == whole.LogID {
		t.Error("different bytes must produce a different LogID")
	}
}

func TestParsePropagatesReadErrors(t *testing.T) {
	r := io.MultiReader(strings.NewReader(csvHeader), iotest.ErrReader(errors.New("disk gone")))

	if _, err := Parse(r, CSV); err == nil || !strings.Contains(err.Error(), "disk gone") {
		t.Errorf("error = %v, want read error", err)
	}
}

func largeCSV(rows int) []byte {
	var b bytes.Buffer
	b.WriteString(csvHeader)
	start := time.Date(2026, 10, 12, 8, 0, 0, 0, time.UTC)
	for i := range rows {
		fmt.Fprintf(&b, "%s,AC-1,41.%06d,29.%06d,%d.5,12.3,%.1f\n",
			start.Add(time.Duration(i)*time.Second).Format(time.RFC3339), i, i, i%120, 100-float64(i)/float64(rows)*70)
	}
	return b.Bytes()
}

func TestParseLargeCSV(t *testing.T) {
	data := largeCSV(100_000)

	res, err := Parse(bytes.NewReader(data), CSV)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Samples) != 100_000 {
		t.Errorf("got %d samples", len(res.Samples))
	}
}

func BenchmarkParseCSV100k(b *testing.B) {
	data := largeCSV(100_000)
	b.SetBytes(int64(len(data)))
	for b.Loop() {
		if _, err := Parse(bytes.NewReader(data), CSV); err != nil {
			b.Fatal(err)
		}
	}
}
