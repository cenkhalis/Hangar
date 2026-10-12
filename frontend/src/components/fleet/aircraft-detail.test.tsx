import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { aircraft, page } from "@/test/fixtures";
import { apiUrl, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { AircraftDetail } from "./aircraft-detail";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/aircraft/1",
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const airworthiness = {
  airworthy: true,
  state: "ok",
  components: [
    {
      installation_id: 1,
      component: 5,
      component_type: 2,
      serial_number: "MOT-001",
      position: "front-left",
      life_status: {
        state: "due_soon",
        limits: [
          {
            limit_type: "flight_hours",
            limit: "500.00",
            used: "460.00",
            remaining: "40.00",
            percent_used: "92.00",
            state: "due_soon",
          },
        ],
      },
    },
  ],
};

const componentTypes = page([
  { id: 2, part_number: "M-2207", name: "Motor", category: "motor", life_limits: [] },
]);

const flight = {
  id: 9,
  aircraft: 1,
  aircraft_serial: "AC-00001",
  log: 4,
  departure_at: "2026-10-12T08:14:03Z",
  arrival_at: "2026-10-12T08:41:57Z",
  duration_seconds: 1674,
  cycles: 1,
  sample_count: 1674,
  max_altitude_m: 118.4,
  max_speed_mps: 17.2,
  distance_m: 9213.7,
  battery_start_pct: 98,
  battery_end_pct: 31.5,
  start_lat: 41.0151,
  start_lon: 28.9795,
  end_lat: 41.0149,
  end_lon: 28.9801,
};

describe("AircraftDetail", () => {
  beforeEach(() => {
    nav.search = "";
    nav.push.mockClear();
    server.use(
      http.get(apiUrl("/api/fleet/aircraft/1/"), () => HttpResponse.json(aircraft())),
      http.get(apiUrl("/api/fleet/aircraft/1/airworthiness/"), () =>
        HttpResponse.json(airworthiness),
      ),
      http.get(apiUrl("/api/fleet/component-types/"), () => HttpResponse.json(componentTypes)),
    );
  });

  it("shows the header and the overview tab by default", async () => {
    renderWithProviders(<AircraftDetail id={1} />);

    expect(await screen.findByRole("heading", { name: "AC-00001" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("120.5 h")).toBeInTheDocument();
    expect(await screen.findByText("Airworthy")).toBeInTheDocument();
  });

  it("falls back to the overview for an unknown tab", async () => {
    nav.search = "tab=bogus";

    renderWithProviders(<AircraftDetail id={1} />);

    expect(await screen.findByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("lists installed components with type names and remaining life", async () => {
    nav.search = "tab=components";

    renderWithProviders(<AircraftDetail id={1} />);

    expect(await screen.findByText("MOT-001")).toBeInTheDocument();
    expect(await screen.findByText("Motor (M-2207)")).toBeInTheDocument();
    expect(screen.getByText("40 h left")).toBeInTheDocument();
    expect(screen.getByText("Due soon")).toBeInTheDocument();
  });

  it("lists this aircraft's flights", async () => {
    nav.search = "tab=flights";
    let query: URLSearchParams | undefined;
    server.use(
      http.get(apiUrl("/api/flights/flights/"), ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json(page([flight]));
      }),
    );

    renderWithProviders(<AircraftDetail id={1} />);

    expect(await screen.findByText("27 min 54 s")).toBeInTheDocument();
    expect(screen.getByText("9.2 km")).toBeInTheDocument();
    expect(screen.getByText("66.5 %")).toBeInTheDocument();
    expect(query?.get("aircraft")).toBe("1");
  });

  it("keeps the selected tab in the URL", async () => {
    renderWithProviders(<AircraftDetail id={1} />);

    await userEvent.click(await screen.findByRole("tab", { name: "Flights" }));

    expect(nav.push).toHaveBeenCalledWith("/aircraft/1?tab=flights", { scroll: false });
  });

  it("explains a missing aircraft", async () => {
    server.use(
      http.get(apiUrl("/api/fleet/aircraft/1/"), () =>
        HttpResponse.json({ detail: "No Aircraft matches the given query." }, { status: 404 }),
      ),
    );

    renderWithProviders(<AircraftDetail id={1} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Not found");
  });
});
