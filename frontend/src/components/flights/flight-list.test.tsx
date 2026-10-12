import { fireEvent, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { aircraft, flight, page } from "@/test/fixtures";
import { apiUrl, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { FlightList } from "./flight-list";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/flights",
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

function serve(flights = page([flight()])) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(apiUrl("/api/flights/flights/"), ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json(flights);
    }),
    http.get(apiUrl("/api/fleet/aircraft/"), () =>
      HttpResponse.json(page([aircraft(), aircraft({ id: 2, serial_number: "AC-00002" })])),
    ),
  );
  return requests;
}

describe("FlightList", () => {
  beforeEach(() => {
    nav.search = "";
    nav.push.mockClear();
  });

  it("lists flights with links to the flight and its aircraft", async () => {
    serve();

    renderWithProviders(<FlightList />);

    const departure = await screen.findByRole("link", { name: /^12 Oct 2026, \d{2}:14$/ });
    expect(departure).toHaveAttribute("href", "/flights/9");
    expect(screen.getByRole("link", { name: "AC-00001" })).toHaveAttribute("href", "/aircraft/1");
    expect(screen.getByText("9.2 km")).toBeInTheDocument();
    expect(screen.getByText("17.2 m/s")).toBeInTheDocument();
  });

  it("sends the aircraft and inclusive local date range to the API", async () => {
    nav.search = "aircraft=2&from=2026-10-01&to=2026-10-12&page=2";
    const requests = serve(page([flight()], 60));

    renderWithProviders(<FlightList />);

    await screen.findByText("Page 2 of 2");
    expect(Object.fromEntries(requests[0])).toEqual({
      page: "2",
      aircraft: "2",
      departure_after: new Date(2026, 9, 1).toISOString(),
      departure_before: new Date(2026, 9, 13).toISOString(),
    });
  });

  it("ignores malformed dates in the URL", async () => {
    nav.search = "from=yesterday";
    const requests = serve();

    renderWithProviders(<FlightList />);

    await screen.findByText("9.2 km");
    expect(requests[0].has("departure_after")).toBe(false);
  });

  it("writes date filters to the URL", async () => {
    nav.search = "aircraft=2";
    serve();

    renderWithProviders(<FlightList />);
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });

    expect(nav.push).toHaveBeenCalledWith("/flights?aircraft=2&from=2026-10-01", { scroll: false });
  });

  it("explains an inverted date range", async () => {
    nav.search = "from=2026-10-12&to=2026-10-01";
    serve(page([]));

    renderWithProviders(<FlightList />);

    expect(await screen.findByText("The start date is after the end date.")).toBeInTheDocument();
  });
});
