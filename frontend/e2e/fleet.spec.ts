import { expect, test } from "@playwright/test";

import { seedOverdueAircraft } from "./seed";

test("browse the fleet and record a historical sign-off", async ({ page, request }) => {
  const { serial, modelId, aircraftId } = await seedOverdueAircraft(request);

  await page.goto(`/aircraft?model=${modelId}`);
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: serial }) });
  await expect(row.getByText("Overdue")).toBeVisible();
  await expect(row.getByText("60 h")).toBeVisible();

  await row.getByRole("link", { name: serial }).click();
  await expect(page).toHaveURL(`/aircraft/${aircraftId}`);
  await expect(page.getByRole("heading", { level: 1, name: serial })).toBeVisible();

  await page.getByRole("tab", { name: "Maintenance" }).click();
  await expect(page).toHaveURL(`/aircraft/${aircraftId}?tab=maintenance`);
  const tasks = page.getByRole("table", { name: "Task status" });
  await expect(tasks.getByText("Every 50 h · 10 h over")).toBeVisible();

  await page.getByRole("button", { name: "Record historical sign-off" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: "INS-50H 50 hour inspection" }).click();
  await dialog.getByLabel("Performed at").fill("2026-01-10T09:00");
  await dialog.getByLabel("Performed by").fill("E2E Tech");
  await dialog.getByRole("button", { name: "Record sign-off" }).click();
  await expect(dialog).toBeHidden();

  // No flights since the sign-off, so the full interval remains.
  await expect(tasks.getByText("OK", { exact: true })).toBeVisible();
  await expect(tasks.getByText(/Every 50 h · 50 h left/)).toBeVisible();
  const history = page.getByRole("table", { name: "Sign-off history" });
  await expect(history.getByRole("row").filter({ hasText: "E2E Tech" })).toContainText("Historical");
});
