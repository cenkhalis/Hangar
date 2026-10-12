import type { Schemas } from "@/lib/api/client";

/** Builders for API payloads, typed against the generated schema so they track the contract. */

export function page<T>(results: T[], count = results.length) {
  return { count, next: null, previous: null, results };
}

export const aircraft = (overrides: Partial<Schemas["Aircraft"]> = {}): Schemas["Aircraft"] => ({
  id: 1,
  model: 1,
  model_name: "Acme Hawk",
  serial_number: "AC-00001",
  registration: "TC-UAV1",
  status: "active",
  in_service_date: "2026-01-15",
  flight_hours: "120.50",
  cycles: 240,
  ...overrides,
});

export const interval = (
  overrides: Partial<Schemas["IntervalStatus"]> = {},
): Schemas["IntervalStatus"] => ({
  interval_type: "flight_hours",
  interval: "50.00",
  used: "37.50",
  remaining: "12.50",
  percent_used: "75.00",
  state: "ok",
  due_date: null,
  due_at_aircraft_hours: "133.00",
  due_at_aircraft_cycles: null,
  ...overrides,
});

export const taskStatus = (
  overrides: Partial<Schemas["TaskStatus"]> = {},
): Schemas["TaskStatus"] => ({
  task: 10,
  code: "INS-50H",
  title: "50 hour inspection",
  state: "ok",
  last_completion: null,
  intervals: [interval()],
  ...overrides,
});

export const completion = (
  overrides: Partial<Schemas["TaskCompletion"]> = {},
): Schemas["TaskCompletion"] => ({
  id: 100,
  aircraft: 1,
  aircraft_serial: "AC-00001",
  task: 10,
  task_code: "INS-50H",
  task_title: "50 hour inspection",
  kind: "work_order",
  work_order_item: 7,
  work_order: 3,
  performed_at: "2026-10-01T09:30:00Z",
  performed_by: "J. Doe",
  notes: "",
  voided: false,
  voided_at: null,
  void_reason: "",
  created_at: "2026-10-01T09:31:00Z",
  ...overrides,
});

export const dueItem = (overrides: Partial<Schemas["DueItem"]> = {}): Schemas["DueItem"] => ({
  aircraft: 1,
  aircraft_serial: "AC-00001",
  task: 10,
  code: "INS-50H",
  title: "50 hour inspection",
  state: "due_soon",
  intervals: [interval({ state: "due_soon" })],
  ...overrides,
});

export const flight = (overrides: Partial<Schemas["Flight"]> = {}): Schemas["Flight"] => ({
  id: 9,
  aircraft: 1,
  aircraft_serial: "AC-00001",
  log: 4,
  departure_at: "2026-10-12T08:14:03Z",
  arrival_at: "2026-10-12T08:41:57Z",
  duration_seconds: 1674,
  cycles: 1,
  sample_count: 1674,
  max_altitude_m: 118.4,
  max_speed_mps: 17.2,
  distance_m: 9213.7,
  battery_start_pct: 98,
  battery_end_pct: 31.5,
  start_lat: 41.0151,
  start_lon: 28.9795,
  end_lat: 41.0149,
  end_lon: 28.9801,
  ...overrides,
});

export const flightLog = (
  overrides: Partial<Schemas["FlightLog"]> = {},
): Schemas["FlightLog"] => ({
  id: 4,
  log_id: "3f2b7c1e9a4d5f60718293a4b5c6d7e8f90112233445566778899aabbccddeef",
  status: "processed",
  rejection_code: "",
  rejection_detail: "",
  source_filename: "AC-00001_20261012T081403Z.csv",
  source_format: "csv",
  schema_version: "1",
  stream_message_id: "1760256843000-0",
  received_at: "2026-10-12T09:00:00Z",
  processed_at: "2026-10-12T09:00:01Z",
  duplicate_count: 0,
  last_seen_at: "2026-10-12T09:00:00Z",
  flight: 9,
  payload: { log_id: "3f2b", aircraft_serial: "AC-00001" },
  ...overrides,
});

export const rejectedLog = (overrides: Partial<Schemas["FlightLog"]> = {}) =>
  flightLog({
    id: 5,
    status: "rejected",
    rejection_code: "unknown_aircraft",
    rejection_detail: "No aircraft with serial 'AC-00099'.",
    source_filename: "AC-00099_20261012T100000Z.csv",
    flight: null,
    ...overrides,
  });

export const workOrderItem = (
  overrides: Partial<Schemas["WorkOrderItem"]> = {},
): Schemas["WorkOrderItem"] => ({
  id: 7,
  work_order: 3,
  task: 10,
  task_code: "INS-50H",
  task_title: "50 hour inspection",
  status: "pending",
  completion: null,
  ...overrides,
});

export const workOrder = (
  overrides: Partial<Schemas["WorkOrder"]> = {},
): Schemas["WorkOrder"] => ({
  id: 3,
  aircraft: 1,
  aircraft_serial: "AC-00001",
  title: "50 h inspection",
  notes: "",
  status: "open",
  opened_at: "2026-10-01T08:00:00Z",
  closed_at: null,
  cancel_reason: "",
  items: [workOrderItem()],
  ...overrides,
});
