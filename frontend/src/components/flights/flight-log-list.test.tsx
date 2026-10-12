import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { flightLog, page, rejectedLog } from "@/test/fixtures";
import { apiUrl, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { FlightLogList } from "./flight-log-list";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/flight-logs",
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

function serve(logs = page([flightLog(), rejectedLog()])) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(apiUrl("/api/flights/logs/"), ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json(logs);
    }),
  );
  return requests;
}

const rowOf = (file: string) => within(screen.getByRole("link", { name: file }).closest("tr")!);

describe("FlightLogList", () => {
  beforeEach(() => {
    nav.search = "";
    nav.push.mockClear();
  });

  it("shows processed and rejected logs", async () => {
    serve();

    renderWithProviders(<FlightLogList />);

    await screen.findByRole("link", { name: "AC-00001_20261012T081403Z.csv" });
    const processed = rowOf("AC-00001_20261012T081403Z.csv");
    expect(processed.getByText("Processed")).toBeInTheDocument();
    expect(processed.getByRole("link", { name: "View flight" })).toHaveAttribute("href", "/flights/9");

    const rejected = rowOf("AC-00099_20261012T100000Z.csv");
    expect(rejected.getByText("Rejected")).toBeInTheDocument();
    expect(rejected.getByText("Unknown aircraft")).toBeInTheDocument();
    expect(rejected.queryByRole("link", { name: "View flight" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AC-00099_20261012T100000Z.csv" })).toHaveAttribute(
      "href",
      "/flight-logs/5",
    );
  });

  it("passes URL filters to the API and ignores unknown values", async () => {
    nav.search = "status=rejected&rejection_code=bogus";
    const requests = serve(page([rejectedLog()]));

    renderWithProviders(<FlightLogList />);

    await screen.findByText("Unknown aircraft");
    expect(Object.fromEntries(requests[0])).toEqual({ page: "1", status: "rejected" });
  });

  it("writes the rejection reason filter to the URL", async () => {
    nav.search = "status=rejected";
    serve();

    renderWithProviders(<FlightLogList />);
    await userEvent.click(screen.getByRole("combobox", { name: "Rejection reason" }));
    await userEvent.click(await screen.findByRole("option", { name: "Overlapping flight" }));

    expect(nav.push).toHaveBeenCalledWith(
      "/flight-logs?status=rejected&rejection_code=overlapping_flight",
      { scroll: false },
    );
  });
});
