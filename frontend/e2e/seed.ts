import { type APIRequestContext, expect } from "@playwright/test";

import { runId } from "./run-id";

const API = process.env.E2E_API_URL ?? "http://localhost:8000";

export async function post<T = { id: number }>(request: APIRequestContext, path: string, data: object) {
  const response = await request.post(`${API}${path}`, { data });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

/** A unique model with one aircraft past a 50 h inspection that has never been signed off. */
export async function seedOverdueAircraft(request: APIRequestContext) {
  const run = runId("E2E");
  const model = await post(request, "/api/fleet/aircraft-models/", {
    manufacturer: "E2E",
    name: run,
    category: "multirotor",
  });
  const aircraft = await post(request, "/api/fleet/aircraft/", {
    model: model.id,
    serial_number: run,
    flight_hours: "60.00",
  });
  const program = await post(request, "/api/maintenance/programs/", {
    aircraft_model: model.id,
    name: `${run} program`,
  });
  const task = await post(request, "/api/maintenance/tasks/", {
    program: program.id,
    code: "INS-50H",
    title: "50 hour inspection",
  });
  await post(request, "/api/maintenance/intervals/", {
    task: task.id,
    interval_type: "flight_hours",
    value: "50.00",
  });
  return { serial: run, modelId: model.id, aircraftId: aircraft.id };
}
