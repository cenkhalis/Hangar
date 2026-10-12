import { expect, test } from "@playwright/test";

test("app shell loads and reaches the backend", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Dashboard" }))
    .toHaveAttribute("aria-current", "page");
  // Proves the browser can call the API: correct NEXT_PUBLIC_API_URL and CORS.
  await expect(page.getByRole("status")).toHaveText("Backend online");
});

test("dashboard reads KPIs from one-row count queries", async ({ page }) => {
  const listRequests: URL[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/^\/api\/(fleet\/aircraft|maintenance\/work-orders|flights\/logs)\/$/.test(url.pathname)) {
      listRequests.push(url);
    }
  });

  await page.goto("/");

  for (const label of ["Total aircraft", "Open work orders", "Rejected flight logs", "Overdue tasks"]) {
    const card = page.locator("[data-slot=card]").filter({ hasText: label });
    await expect(card.locator("[data-slot=card-title]")).toHaveText(/^[\d,]+$/);
  }
  expect(listRequests).toHaveLength(5);
  for (const url of listRequests) expect(url.searchParams.get("page_size")).toBe("1");
});
