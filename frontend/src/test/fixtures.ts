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
