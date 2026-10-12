import { expect, test } from "@playwright/test";

test("app shell loads and reaches the backend", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "HANGAR" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Dashboard" }))
    .toHaveAttribute("aria-current", "page");
  // Proves the browser can call the API: correct NEXT_PUBLIC_API_URL and CORS.
  await expect(page.getByRole("status")).toHaveText("Backend online");
});
