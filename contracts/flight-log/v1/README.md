# Flight log message — v1

Contract between the Go `ingest` service (producer) and the Django `flights` consumer.

## Transport

| Item | Value |
|---|---|
| Redis stream | `hangar:flight-logs:v1` (approximate `MAXLEN` 100000) |
| Consumer group | `django-flights` |
| Dead-letter stream | `hangar:flight-logs:v1:dlq` |

Each stream entry has two fields:

| Field | Value |
|---|---|
| `schema_version` | `"1"` |
| `payload` | JSON document described below (UTF-8) |

Delivery is **at least once**. Consumers must be idempotent on `log_id`.

## Payload

See [`message.json`](message.json) for the golden example used by contract tests on both sides.

| Field | Type | Notes |
|---|---|---|
| `log_id` | string | Lowercase hex SHA-256 of the raw log file bytes (64 chars). Idempotency key |
| `aircraft_serial` | string | Matches `fleet.Aircraft.serial_number` |
| `departure_at` | RFC 3339 UTC | First airborne sample |
| `arrival_at` | RFC 3339 UTC | Last airborne sample; strictly after `departure_at` |
| `cycles` | integer ≥ 1 | Always `1` in v1 (single-sortie logs only) |
| `telemetry.sample_count` | integer ≥ 1 | All samples in the log, including ground samples |
| `telemetry.max_altitude_m` | number | Maximum altitude above ground level |
| `telemetry.max_speed_mps` | number ≥ 0 | Maximum ground speed |
| `telemetry.distance_m` | number ≥ 0 | Haversine path length over airborne samples |
| `telemetry.battery_start_pct` / `battery_end_pct` | number 0–100 | First / last sample |
| `telemetry.start` / `end` | `{lat, lon}` | Position of first / last airborne sample |
| `source.filename` | string | Original file name |
| `source.format` | `"csv"` \| `"json"` | |
| `source.ingested_at` | RFC 3339 UTC | When the ingest service published the message |

## Raw log format (ingest input)

Samples share these fields in both formats:

| Field | Type | Required |
|---|---|---|
| `timestamp` | RFC 3339 | yes |
| `aircraft_serial` | string | yes (same value on every sample) |
| `lat`, `lon` | number | yes |
| `alt_agl_m` | number | yes |
| `speed_mps` | number | yes |
| `battery_pct` | number | yes |
| `in_air` | boolean | no — when absent, a sample is airborne if `alt_agl_m > 1.0` |

CSV files have a header row with these column names (any order; `in_air` column optional, empty cells
mean absent). JSON files are `{"samples": [ {...}, ... ]}`.

A log must contain exactly one contiguous airborne segment.

## Versioning

Breaking changes get a new stream (`hangar:flight-logs:v2`) and a new directory here. Consumers send
messages with an unknown `schema_version` to the dead-letter stream.
