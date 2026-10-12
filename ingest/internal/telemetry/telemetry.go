// Package telemetry defines flight log samples and airborne-segment detection.
package telemetry

import "time"

// DefaultAirborneAltitudeM is the altitude above ground above which a sample without an explicit
// in_air flag is considered airborne.
const DefaultAirborneAltitudeM = 1.0

// Sample is one telemetry record from a flight log.
type Sample struct {
	Timestamp      time.Time
	AircraftSerial string
	Lat            float64
	Lon            float64
	AltAGLM        float64
	SpeedMPS       float64
	BatteryPct     float64
	// InAir is the optional explicit airborne flag; nil means "not reported".
	InAir *bool
}

// Airborne reports whether the sample is airborne: the explicit in_air flag when present,
// otherwise altitude above ground greater than thresholdM.
func (s Sample) Airborne(thresholdM float64) bool {
	if s.InAir != nil {
		return *s.InAir
	}
	return s.AltAGLM > thresholdM
}

// Segment is an inclusive range of sample indices that are all airborne.
type Segment struct {
	Start int
	End   int
}

// AirborneSegments returns the maximal runs of consecutive airborne samples.
func AirborneSegments(samples []Sample, thresholdM float64) []Segment {
	var segments []Segment
	start := -1
	for i, s := range samples {
		switch airborne := s.Airborne(thresholdM); {
		case airborne && start < 0:
			start = i
		case !airborne && start >= 0:
			segments = append(segments, Segment{Start: start, End: i - 1})
			start = -1
		}
	}
	if start >= 0 {
		segments = append(segments, Segment{Start: start, End: len(samples) - 1})
	}
	return segments
}
