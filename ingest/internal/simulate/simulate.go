// Package simulate generates realistic synthetic single-sortie flight logs.
package simulate

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/rand/v2"
	"strconv"
	"time"

	"github.com/cenkhalis/hangar/ingest/internal/summary"
	"github.com/cenkhalis/hangar/ingest/internal/telemetry"
)

const metresPerDegreeLat = summary.EarthRadiusM * math.Pi / 180

// Config describes one simulated flight.
type Config struct {
	Serial          string
	Start           time.Time // first (ground) sample
	SampleInterval  time.Duration
	GroundTime      time.Duration // idle time before takeoff and after landing
	CruiseDuration  time.Duration
	CruiseAltitudeM float64
	CruiseSpeedMPS  float64
	ClimbRateMPS    float64
	DescentRateMPS  float64
	Home            summary.Position
	// IncludeInAir adds the optional in_air flag to every sample.
	IncludeInAir bool
	Seed         uint64
}

// DefaultConfig returns a ~25 minute multirotor survey flight.
func DefaultConfig(serial string, start time.Time) Config {
	return Config{
		Serial:          serial,
		Start:           start.UTC(),
		SampleInterval:  time.Second,
		GroundTime:      30 * time.Second,
		CruiseDuration:  20 * time.Minute,
		CruiseAltitudeM: 100,
		CruiseSpeedMPS:  14,
		ClimbRateMPS:    3,
		DescentRateMPS:  2,
		Home:            summary.Position{Lat: 41.0151, Lon: 28.9795},
		Seed:            1,
	}
}

type phase int

const (
	ground phase = iota
	climb
	cruise
	descend
)

// Flight generates the samples: ground idle, vertical climb, a circular loop that returns home,
// vertical descent, ground idle. Noise and battery drain are deterministic for a given seed.
func Flight(cfg Config) []telemetry.Sample {
	rng := rand.New(rand.NewPCG(cfg.Seed, cfg.Seed^0x9e3779b97f4a7c15))
	dt := cfg.SampleInterval.Seconds()
	climbTime := cfg.CruiseAltitudeM / cfg.ClimbRateMPS
	descentTime := cfg.CruiseAltitudeM / cfg.DescentRateMPS
	cruiseTime := cfg.CruiseDuration.Seconds()
	groundTime := cfg.GroundTime.Seconds()

	type span struct {
		p   phase
		dur float64
	}
	spans := []span{{ground, groundTime}, {climb, climbTime}, {cruise, cruiseTime}, {descend, descentTime}, {ground, groundTime}}
	total := 0.0
	for _, s := range spans {
		total += s.dur
	}

	batteryStart := 95 + rng.Float64()*5
	airborneTime := climbTime + cruiseTime + descentTime
	drainPerSecond := (batteryStart - (25 + rng.Float64()*15)) / airborneTime
	radius := cfg.CruiseSpeedMPS * cruiseTime / (2 * math.Pi)
	heading := rng.Float64() * 2 * math.Pi // direction of the loop centre from home

	var samples []telemetry.Sample
	battery := batteryStart
	for t := 0.0; t <= total+1e-9; t += dt {
		p, local := ground, 0.0
		elapsed := 0.0
		for i, s := range spans {
			if t < elapsed+s.dur || i == len(spans)-1 {
				p, local = s.p, t-elapsed
				break
			}
			elapsed += s.dur
		}

		var alt, speed, north, east float64
		switch p {
		case climb:
			alt = math.Min(cfg.CruiseAltitudeM, local*cfg.ClimbRateMPS)
			speed = 0.5 + rng.Float64()*0.5
		case cruise:
			theta := 2 * math.Pi * local / cruiseTime
			// Circle through home: centre at radius along heading, start angle pointing back home.
			cx, cy := radius*math.Cos(heading), radius*math.Sin(heading)
			north = cx - radius*math.Cos(heading+theta)
			east = cy - radius*math.Sin(heading+theta)
			alt = cfg.CruiseAltitudeM + rng.NormFloat64()*1.5
			speed = math.Max(0, cfg.CruiseSpeedMPS+rng.NormFloat64()*0.8)
		case descend:
			alt = math.Max(0, cfg.CruiseAltitudeM-local*cfg.DescentRateMPS)
			speed = 0.3 + rng.Float64()*0.4
		case ground:
			alt, speed = 0, 0
		}
		if p != ground {
			battery = math.Max(0, battery-drainPerSecond*dt)
		}

		lat := cfg.Home.Lat + north/metresPerDegreeLat
		lon := cfg.Home.Lon + east/(metresPerDegreeLat*math.Cos(cfg.Home.Lat*math.Pi/180))
		sample := telemetry.Sample{
			Timestamp:      cfg.Start.Add(time.Duration(t * float64(time.Second))),
			AircraftSerial: cfg.Serial,
			Lat:            lat,
			Lon:            lon,
			AltAGLM:        math.Max(0, alt),
			SpeedMPS:       speed,
			BatteryPct:     battery,
		}
		if cfg.IncludeInAir {
			inAir := p != ground && sample.AltAGLM > telemetry.DefaultAirborneAltitudeM
			sample.InAir = &inAir
		}
		samples = append(samples, sample)
	}
	return samples
}

var csvHeader = []string{"timestamp", "aircraft_serial", "lat", "lon", "alt_agl_m", "speed_mps", "battery_pct"}

func formatFloat(v float64, decimals int) string { return strconv.FormatFloat(v, 'f', decimals, 64) }

// WriteCSV writes samples in the raw CSV log format.
func WriteCSV(w io.Writer, samples []telemetry.Sample, includeInAir bool) error {
	cw := csv.NewWriter(w)
	header := csvHeader
	if includeInAir {
		header = append(append([]string{}, csvHeader...), "in_air")
	}
	if err := cw.Write(header); err != nil {
		return err
	}
	for _, s := range samples {
		row := []string{
			s.Timestamp.UTC().Format(time.RFC3339Nano), s.AircraftSerial,
			formatFloat(s.Lat, 7), formatFloat(s.Lon, 7),
			formatFloat(s.AltAGLM, 2), formatFloat(s.SpeedMPS, 2), formatFloat(s.BatteryPct, 2),
		}
		if includeInAir {
			value := ""
			if s.InAir != nil {
				value = strconv.FormatBool(*s.InAir)
			}
			row = append(row, value)
		}
		if err := cw.Write(row); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}

type jsonSample struct {
	Timestamp      string  `json:"timestamp"`
	AircraftSerial string  `json:"aircraft_serial"`
	Lat            float64 `json:"lat"`
	Lon            float64 `json:"lon"`
	AltAGLM        float64 `json:"alt_agl_m"`
	SpeedMPS       float64 `json:"speed_mps"`
	BatteryPct     float64 `json:"battery_pct"`
	InAir          *bool   `json:"in_air,omitempty"`
}

func round(v float64, decimals int) float64 {
	p := math.Pow(10, float64(decimals))
	return math.Round(v*p) / p
}

// WriteJSON writes samples in the raw JSON log format.
func WriteJSON(w io.Writer, samples []telemetry.Sample) error {
	out := struct {
		Samples []jsonSample `json:"samples"`
	}{Samples: make([]jsonSample, len(samples))}
	for i, s := range samples {
		out.Samples[i] = jsonSample{
			Timestamp: s.Timestamp.UTC().Format(time.RFC3339Nano), AircraftSerial: s.AircraftSerial,
			Lat: round(s.Lat, 7), Lon: round(s.Lon, 7),
			AltAGLM: round(s.AltAGLM, 2), SpeedMPS: round(s.SpeedMPS, 2), BatteryPct: round(s.BatteryPct, 2),
			InAir: s.InAir,
		}
	}
	enc := json.NewEncoder(w)
	if err := enc.Encode(out); err != nil {
		return fmt.Errorf("encode json log: %w", err)
	}
	return nil
}
