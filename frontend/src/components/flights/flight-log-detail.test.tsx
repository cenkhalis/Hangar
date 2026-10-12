import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { flightLog, rejectedLog } from "@/test/fixtures";
import { apiUrl, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { FlightLogDetail } from "./flight-log-detail";

const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

function serveLog(log: ReturnType<typeof flightLog>) {
  let calls = 0;
  server.use(
    http.get(apiUrl(`/api/flights/logs/${log.id}/`), () => {
      calls += 1;
      return HttpResponse.json(log);
    }),
  );
  return () => calls;
}

describe("FlightLogDetail", () => {
  beforeEach(() => {
    Object.values(toast).forEach((spy) => spy.mockClear());
  });

  it("shows a processed log's details and payload without a reprocess action", async () => {
    serveLog(flightLog());

    renderWithProviders(<FlightLogDetail id={4} />);

    expect(
      await screen.findByRole("heading", { name: "AC-00001_20261012T081403Z.csv" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View flight" })).toHaveAttribute("href", "/flights/9");
    expect(screen.getByText("CSV, schema v1")).toBeInTheDocument();
    expect(screen.getByText(/"aircraft_serial": "AC-00001"/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reprocess/ })).not.toBeInTheDocument();
  });

  it("explains why a log was rejected", async () => {
    serveLog(rejectedLog());

    renderWithProviders(<FlightLogDetail id={5} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unknown aircraft");
    expect(alert).toHaveTextContent("No aircraft with serial 'AC-00099'.");
  });

  it("reprocesses a rejected log and refreshes it", async () => {
    const calls = serveLog(rejectedLog());
    server.use(
      http.post(apiUrl("/api/flights/logs/5/reprocess/"), () =>
        HttpResponse.json(rejectedLog({ status: "processed", rejection_code: "", flight: 12 })),
      ),
    );

    renderWithProviders(<FlightLogDetail id={5} />);
    await userEvent.click(await screen.findByRole("button", { name: "Reprocess" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Flight log processed", expect.anything()));
    await waitFor(() => expect(calls()).toBe(2));
  });

  it("warns when the log is rejected again", async () => {
    serveLog(rejectedLog());
    server.use(
      http.post(apiUrl("/api/flights/logs/5/reprocess/"), () => HttpResponse.json(rejectedLog())),
    );

    renderWithProviders(<FlightLogDetail id={5} />);
    await userEvent.click(await screen.findByRole("button", { name: "Reprocess" }));

    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith("Still rejected: Unknown aircraft", {
        description: "No aircraft with serial 'AC-00099'.",
      }),
    );
  });

  it("reports a domain error from reprocessing", async () => {
    serveLog(rejectedLog());
    server.use(
      http.post(apiUrl("/api/flights/logs/5/reprocess/"), () =>
        HttpResponse.json(
          { code: "flight_log_not_rejected", detail: "Only rejected flight logs can be reprocessed." },
          { status: 409 },
        ),
      ),
    );

    renderWithProviders(<FlightLogDetail id={5} />);
    await userEvent.click(await screen.findByRole("button", { name: "Reprocess" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Only rejected logs can be reprocessed", {
        description: "Only rejected flight logs can be reprocessed.",
      }),
    );
  });
});
