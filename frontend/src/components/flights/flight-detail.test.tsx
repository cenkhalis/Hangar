import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { flight } from "@/test/fixtures";
import { apiUrl, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { FlightDetail } from "./flight-detail";

describe("FlightDetail", () => {
  it("summarises the flight's telemetry", async () => {
    server.use(http.get(apiUrl("/api/flights/flights/9/"), () => HttpResponse.json(flight())));

    renderWithProviders(<FlightDetail id={9} />);

    expect(
      // Local time zone of the test machine; only the date and minutes are fixed.
      await screen.findByRole("heading", { name: /^Flight 12 Oct 2026, \d{2}:14$/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("27 min 54 s")).toBeInTheDocument();
    expect(screen.getByText("118.4 m")).toBeInTheDocument();
    expect(screen.getByText("66.5 %")).toBeInTheDocument();
    expect(screen.getByText("98 % → 31.5 %")).toBeInTheDocument();
    expect(screen.getByText("1,674")).toBeInTheDocument();
    expect(screen.getByText("41.01510° N, 28.97950° E")).toBeInTheDocument();
  });

  it("links to the aircraft and the source log", async () => {
    server.use(http.get(apiUrl("/api/flights/flights/9/"), () => HttpResponse.json(flight())));

    renderWithProviders(<FlightDetail id={9} />);

    expect(await screen.findByRole("link", { name: "AC-00001" })).toHaveAttribute(
      "href",
      "/aircraft/1",
    );
    expect(screen.getByRole("link", { name: "View source log" })).toHaveAttribute(
      "href",
      "/flight-logs/4",
    );
  });

  it("explains a missing flight", async () => {
    server.use(
      http.get(apiUrl("/api/flights/flights/9/"), () =>
        HttpResponse.json({ detail: "No Flight matches the given query." }, { status: 404 }),
      ),
    );

    renderWithProviders(<FlightDetail id={9} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Not found");
  });
});
