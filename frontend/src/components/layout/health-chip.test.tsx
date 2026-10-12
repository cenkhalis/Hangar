import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { apiUrl, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { HealthChip } from "./health-chip";

const healthy = { status: "ok", checks: { database: "ok" } };
const unavailable = { status: "unavailable", checks: { database: "unavailable" } };

describe("HealthChip", () => {
  it("shows online with the individual checks when the backend is healthy", async () => {
    server.use(http.get(apiUrl("/api/health/"), () => HttpResponse.json(healthy)));

    renderWithProviders(<HealthChip />);

    const status = await screen.findByRole("status");
    await screen.findByText("Backend online");
    expect(status).toHaveAttribute("title", "database: ok");
  });

  it("shows unavailable when the backend reports 503", async () => {
    server.use(
      http.get(apiUrl("/api/health/"), () => HttpResponse.json(unavailable, { status: 503 })),
    );

    renderWithProviders(<HealthChip />);

    expect(await screen.findByText("Backend unavailable")).toBeInTheDocument();
  });

  it("rechecks on demand", async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl("/api/health/"), () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json(healthy);
      }),
    );

    renderWithProviders(<HealthChip />);
    await screen.findByText("Backend unavailable");
    await userEvent.click(screen.getByRole("button", { name: "Recheck backend" }));

    expect(await screen.findByText("Backend online")).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});
