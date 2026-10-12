import { expect, test } from "@playwright/test";

import { seedOverdueAircraft } from "./seed";

test("create a work order from the due board and sign it off", async ({ page, request }) => {
  const { serial, aircraftId } = await seedOverdueAircraft(request);

  await page.goto(`/maintenance?aircraft=${aircraftId}`);
  const row = page.getByRole("row").filter({ hasText: "INS-50H" });
  await expect(row.getByText("Overdue")).toBeVisible();
  await expect(row).toContainText("10 h over");

  await row.getByRole("button", { name: `Create work order for INS-50H on ${serial}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox", { name: /INS-50H/ })).toBeChecked();
  await dialog.getByLabel("Title").fill("50 h inspection");
  await dialog.getByRole("button", { name: "Create work order" }).click();

  await expect(page).toHaveURL(/\/work-orders\/\d+$/);
  const workOrderUrl = page.url();
  await expect(page.getByRole("heading", { level: 1, name: /^WO-\d+ 50 h inspection$/ })).toBeVisible();
  await expect(page.getByText("· 0 of 1 signed off")).toBeVisible();

  // The task is now pending, so a second work order cannot include it.
  await page.goto(`/maintenance?aircraft=${aircraftId}`);
  await page.getByRole("button", { name: `Create work order for INS-50H on ${serial}` }).click();
  await expect(dialog.getByRole("checkbox", { name: /INS-50H/ })).toBeDisabled();
  await expect(dialog.getByText(/^On WO-\d+$/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto(workOrderUrl);
  await page.getByRole("button", { name: "Sign off INS-50H" }).click();
  await dialog.getByLabel("Performed by").fill("E2E Tech");
  await dialog.getByRole("button", { name: "Sign off" }).click();
  await expect(dialog).toBeHidden();

  // Signing off the last pending item completes the work order and restarts the interval.
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await expect(page.getByText("· 1 of 1 signed off")).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign off/ })).toHaveCount(0);

  await page.goto(`/aircraft/${aircraftId}?tab=maintenance`);
  await expect(
    page.getByRole("table", { name: "Task status" }).getByText(/Every 50 h · 50 h left/),
  ).toBeVisible();
});
