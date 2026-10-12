import { renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { runId } from "./run-id";

const API = process.env.E2E_API_URL ?? "http://localhost:8000";
/** Bind-mounted into the ingest container (docker-compose.yml). */
const INBOX = process.env.E2E_INBOX_DIR ?? path.resolve(__dirname, "../../var/flight-logs/inbox");

/** A single-sortie CSV log: 5 s on the ground, 60 s at 30 m and 10 m/s heading east, 5 s down. */
function flightLogCsv(serial: string, start: Date): string {
  const rows = ["timestamp,aircraft_serial,lat,lon,alt_agl_m,speed_mps,battery_pct"];
  for (let s = 0; s < 70; s += 1) {
    const airborne = s >= 5 && s < 65;
    const lon = 28.9795 + Math.min(Math.max(s - 5, 0), 59) * 0.000119;
    rows.push(
      [
        new Date(start.getTime() + s * 1000).toISOString().replace(".000", ""),
        serial,
        "41.0151000",
        lon.toFixed(7),
        airborne ? "30.00" : "0.00",
        airborne ? "10.00" : "0.00",
        (95 - s * 0.1).toFixed(2),
      ].join(","),
    );
  }
  return `${rows.join("\n")}\n`;
}

/** Write under a dot-name the inbox ignores, then rename, so ingest never reads a partial file. */
function dropLog(filename: string, contents: string) {
  const temporary = path.join(INBOX, `.${filename}`);
  writeFileSync(temporary, contents);
  renameSync(temporary, path.join(INBOX, filename));
}

test("reprocess a rejected log and open the recorded flight", async ({ page, request }) => {
  const serial = runId("E2E-LOG");
  const filename = `${serial}_20260115T090000Z.csv`;
  dropLog(filename, flightLogCsv(serial, new Date("2026-01-15T09:00:00Z")));

  // The aircraft is not registered yet, so the pipeline rejects the log.
  let logId: number | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(`${API}/api/flights/logs/?status=rejected`);
        const { results } = (await response.json()) as {
          results: { id: number; source_filename: string }[];
        };
        logId = results.find((log) => log.source_filename === filename)?.id;
        return logId;
      },
      { timeout: 30_000 },
    )
    .toBeDefined();

  await page.goto("/flight-logs?status=rejected&rejection_code=unknown_aircraft");
  await page.getByRole("link", { name: filename }).click();
  await expect(page).toHaveURL(`/flight-logs/${logId}`);
  await expect(page.getByRole("alert").filter({ hasText: "Unknown aircraft" })).toBeVisible();

  const model = await (
    await request.post(`${API}/api/fleet/aircraft-models/`, {
      data: { manufacturer: "E2E", name: serial, category: "multirotor" },
    })
  ).json();
  const aircraft = await (
    await request.post(`${API}/api/fleet/aircraft/`, {
      data: { model: model.id, serial_number: serial },
    })
  ).json();

  await page.getByRole("button", { name: "Reprocess" }).click();
  await expect(page.getByText("Flight log processed")).toBeVisible();
  // The refreshed log is processed: no Reprocess action and a link to its flight.
  await expect(page.getByRole("button", { name: "Reprocess" })).toBeHidden();

  await page.getByRole("link", { name: "View flight" }).click();
  await expect(page).toHaveURL(/\/flights\/\d+$/);
  await expect(page.getByRole("heading", { level: 1, name: /^Flight 15 Jan 2026/ })).toBeVisible();
  await expect(page.getByRole("link", { name: serial })).toHaveAttribute(
    "href",
    `/aircraft/${aircraft.id}`,
  );
  await expect(page.getByText("59 s")).toBeVisible();
  await expect(page.getByText("30 m", { exact: true })).toBeVisible();
  await expect(page.getByText("41.01510° N, 28.97950° E")).toBeVisible();

  await page.goto(`/flights?aircraft=${aircraft.id}`);
  await expect(page.getByRole("table", { name: "Flights" }).getByRole("row")).toHaveCount(2);
});
