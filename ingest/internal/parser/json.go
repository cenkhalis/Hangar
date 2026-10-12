package parser

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/cenkhalis/hangar/ingest/internal/telemetry"
)

type jsonSample struct {
	Timestamp      *string  `json:"timestamp"`
	AircraftSerial *string  `json:"aircraft_serial"`
	Lat            *float64 `json:"lat"`
	Lon            *float64 `json:"lon"`
	AltAGLM        *float64 `json:"alt_agl_m"`
	SpeedMPS       *float64 `json:"speed_mps"`
	BatteryPct     *float64 `json:"battery_pct"`
	InAir          *bool    `json:"in_air"`
}

// parseJSON streams {"samples": [...]} one element at a time instead of loading the document.
func parseJSON(r io.Reader) ([]telemetry.Sample, error) {
	dec := json.NewDecoder(r)
	if err := expectDelim(dec, '{'); err != nil {
		return nil, err
	}

	var samples []telemetry.Sample
	found := false
	for dec.More() {
		key, err := dec.Token()
		if err != nil {
			return nil, jsonError(0, err)
		}
		if key != "samples" {
			var skip json.RawMessage
			if err := dec.Decode(&skip); err != nil {
				return nil, jsonError(0, err)
			}
			continue
		}
		found = true
		if err := expectDelim(dec, '['); err != nil {
			return nil, err
		}
		for row := 1; dec.More(); row++ {
			var raw jsonSample
			if err := dec.Decode(&raw); err != nil {
				return nil, jsonError(row, err)
			}
			sample, err := raw.toSample(row)
			if err != nil {
				return nil, err
			}
			samples = append(samples, sample)
		}
		if err := expectDelim(dec, ']'); err != nil {
			return nil, err
		}
	}
	if err := expectDelim(dec, '}'); err != nil {
		return nil, err
	}
	if !found {
		return nil, &Error{Field: "samples", Msg: `missing "samples" array`}
	}
	return samples, nil
}

func (j jsonSample) toSample(row int) (telemetry.Sample, error) {
	missing := func(field string) error { return &Error{Row: row, Field: field, Msg: "missing"} }
	switch {
	case j.Timestamp == nil:
		return telemetry.Sample{}, missing(fieldTimestamp)
	case j.AircraftSerial == nil:
		return telemetry.Sample{}, missing(fieldSerial)
	case j.Lat == nil:
		return telemetry.Sample{}, missing(fieldLat)
	case j.Lon == nil:
		return telemetry.Sample{}, missing(fieldLon)
	case j.AltAGLM == nil:
		return telemetry.Sample{}, missing(fieldAlt)
	case j.SpeedMPS == nil:
		return telemetry.Sample{}, missing(fieldSpeed)
	case j.BatteryPct == nil:
		return telemetry.Sample{}, missing(fieldBattery)
	}
	ts, err := parseTimestamp(row, *j.Timestamp)
	if err != nil {
		return telemetry.Sample{}, err
	}
	return telemetry.Sample{
		Timestamp:      ts,
		AircraftSerial: strings.TrimSpace(*j.AircraftSerial),
		Lat:            *j.Lat,
		Lon:            *j.Lon,
		AltAGLM:        *j.AltAGLM,
		SpeedMPS:       *j.SpeedMPS,
		BatteryPct:     *j.BatteryPct,
		InAir:          j.InAir,
	}, nil
}

func expectDelim(dec *json.Decoder, want json.Delim) error {
	tok, err := dec.Token()
	if err != nil {
		return jsonError(0, err)
	}
	if tok != want {
		return &Error{Msg: fmt.Sprintf("expected %q, got %v", want, tok)}
	}
	return nil
}

func jsonError(row int, err error) error {
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return &Error{Row: row, Msg: "unexpected end of JSON"}
	}
	return &Error{Row: row, Msg: err.Error()}
}
