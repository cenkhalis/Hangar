import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { apiUrl, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { HealthStatus } from "./health-status";

const healthy = { status: "ok", checks: { database: "ok" } };
const unavailable = { status: "unavailable", checks: { database: "unavailable" } };

describe("HealthStatus", () => {
  it("shows online when the backend is healthy", async () => {
    server.use(http.get(apiUrl("/api/health/"), () => HttpResponse.json(healthy)));

    renderWithProviders(<HealthStatus />);

    expect(await screen.findByText("Backend online")).toBeInTheDocument();
  });

  it("shows unavailable when the backend reports 503", async () => {
    server.use(
      http.get(apiUrl("/api/health/"), () => HttpResponse.json(unavailable, { status: 503 })),
    );

    renderWithProviders(<HealthStatus />);

    expect(await screen.findByText("Backend unavailable")).toBeInTheDocument();
  });

  it("refetches when Retry is clicked", async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl("/api/health/"), () => {
        calls += 1;
        return calls === 1 ? HttpResponse.error() : HttpResponse.json(healthy);
      }),
    );

    renderWithProviders(<HealthStatus />);
    await screen.findByText("Backend unavailable");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Backend online")).toBeInTheDocument();
    expect(calls).toBe(2);
  });
});
