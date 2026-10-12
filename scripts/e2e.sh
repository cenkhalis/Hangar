#!/usr/bin/env bash
# End-to-end check of the flight log pipeline against the docker compose stack:
# simulated log -> ingest -> Redis stream -> flights consumer -> Flight + aircraft usage.
set -euo pipefail

API=${API:-http://localhost:8000/api}
TIMEOUT=${TIMEOUT:-90}
SERIAL="E2E-$(date +%s)"
INBOX=var/flight-logs/inbox

cd "$(dirname "$0")/.."

json() { python3 -c "import sys, json; print(json.load(sys.stdin)$1)"; }
post() { curl -sf -H 'Content-Type: application/json' -X POST "$API/$1" -d "$2"; }
wait_for() { # wait_for <description> <command...>
  local desc=$1; shift
  for ((i = 0; i < TIMEOUT; i++)); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "FAIL: timed out waiting for $desc" >&2
  exit 1
}

echo "==> Starting stack"
mkdir -p "$INBOX"
docker compose up --build -d --wait postgres redis backend ingest flights-consumer

echo "==> Registering aircraft $SERIAL"
MODEL=$(post fleet/aircraft-models/ "{\"manufacturer\":\"E2E\",\"name\":\"$SERIAL\",\"category\":\"multirotor\"}" | json '["id"]')
AIRCRAFT=$(post fleet/aircraft/ "{\"model\":$MODEL,\"serial_number\":\"$SERIAL\"}" | json '["id"]')

echo "==> Simulating a flight log"
docker compose run --rm --no-deps --entrypoint /simulate ingest \
  -serial "$SERIAL" -count 1 -cruise 5m -start 2026-01-15T09:00:00Z -out /data/flight-logs/inbox
FILE="${SERIAL}_20260115T090000Z.csv"

flight_count() { curl -sf "$API/flights/flights/?aircraft=$AIRCRAFT" | json '["count"]'; }
has_flight() { [ "$(flight_count)" = "1" ]; }
wait_for "flight to be recorded" has_flight

CYCLES=$(curl -sf "$API/fleet/aircraft/$AIRCRAFT/" | json '["cycles"]')
HOURS=$(curl -sf "$API/fleet/aircraft/$AIRCRAFT/" | json '["flight_hours"]')
echo "    flight recorded; aircraft at $HOURS h, $CYCLES cycles"
[ "$CYCLES" = "1" ] || { echo "FAIL: expected 1 cycle, got $CYCLES" >&2; exit 1; }

echo "==> Dropping the same file again (duplicate)"
cp "var/flight-logs/processed/$FILE" "$INBOX/$FILE"
dup_seen() {
  [ "$(curl -sf "$API/flights/logs/?status=processed" | python3 -c "
import sys, json
logs = [l for l in json.load(sys.stdin)['results'] if l['source_filename'] == '$FILE']
print(logs[0]['duplicate_count'] if logs else 0)")" = "1" ]
}
wait_for "duplicate to be detected" dup_seen

CYCLES=$(curl -sf "$API/fleet/aircraft/$AIRCRAFT/" | json '["cycles"]')
[ "$CYCLES" = "1" ] || { echo "FAIL: duplicate changed usage (cycles=$CYCLES)" >&2; exit 1; }
[ "$(flight_count)" = "1" ] || { echo "FAIL: duplicate created a second flight" >&2; exit 1; }

echo "PASS: flight ingested once, usage recorded once ($HOURS h, 1 cycle)"
