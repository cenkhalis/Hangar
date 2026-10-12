package parser

import (
	"bufio"
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/cenkhalis/hangar/ingest/internal/telemetry"
)

var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

func parseCSV(r io.Reader) ([]telemetry.Sample, error) {
	br := bufio.NewReader(r)
	if prefix, err := br.Peek(len(utf8BOM)); err == nil && bytes.Equal(prefix, utf8BOM) {
		_, _ = br.Discard(len(utf8BOM))
	}

	cr := csv.NewReader(br)
	cr.TrimLeadingSpace = true
	cr.ReuseRecord = true

	header, err := cr.Read()
	if errors.Is(err, io.EOF) {
		return nil, &Error{Msg: "empty file"}
	}
	if err != nil {
		return nil, csvError(err)
	}
	columns := make(map[string]int, len(header))
	for i, name := range header {
		columns[strings.ToLower(strings.TrimSpace(name))] = i
	}
	for _, field := range requiredFields {
		if _, ok := columns[field]; !ok {
			return nil, &Error{Row: 1, Field: field, Msg: "missing column"}
		}
	}

	var samples []telemetry.Sample
	for {
		record, err := cr.Read()
		if errors.Is(err, io.EOF) {
			return samples, nil
		}
		if err != nil {
			return nil, csvError(err)
		}
		line, _ := cr.FieldPos(0)
		sample, err := csvSample(record, columns, line)
		if err != nil {
			return nil, err
		}
		samples = append(samples, sample)
	}
}

func csvSample(record []string, columns map[string]int, row int) (telemetry.Sample, error) {
	get := func(field string) string { return record[columns[field]] }

	ts, err := parseTimestamp(row, get(fieldTimestamp))
	if err != nil {
		return telemetry.Sample{}, err
	}
	sample := telemetry.Sample{Timestamp: ts, AircraftSerial: strings.TrimSpace(get(fieldSerial))}
	for _, f := range []struct {
		name string
		dst  *float64
	}{
		{fieldLat, &sample.Lat},
		{fieldLon, &sample.Lon},
		{fieldAlt, &sample.AltAGLM},
		{fieldSpeed, &sample.SpeedMPS},
		{fieldBattery, &sample.BatteryPct},
	} {
		if *f.dst, err = parseFloat(row, f.name, get(f.name)); err != nil {
			return telemetry.Sample{}, err
		}
	}
	if idx, ok := columns[fieldInAir]; ok {
		if raw := strings.TrimSpace(record[idx]); raw != "" {
			inAir, err := strconv.ParseBool(raw)
			if err != nil {
				return telemetry.Sample{}, &Error{Row: row, Field: fieldInAir, Msg: fmt.Sprintf("not a boolean: %q", raw)}
			}
			sample.InAir = &inAir
		}
	}
	return sample, nil
}

func csvError(err error) error {
	var pe *csv.ParseError
	if errors.As(err, &pe) {
		return &Error{Row: pe.Line, Msg: pe.Err.Error()}
	}
	return fmt.Errorf("read csv: %w", err)
}
