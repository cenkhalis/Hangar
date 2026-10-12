import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { aircraft, dueItem, page } from "@/test/fixtures";
import { apiUrl, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { AircraftList } from "./aircraft-list";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/aircraft",
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const models = page([{ id: 1, manufacturer: "Acme", name: "Hawk", category: "multirotor" }]);

const fleet = [
  aircraft({ id: 1, serial_number: "AC-00001" }),
  aircraft({ id: 2, serial_number: "AC-00002", registration: "" }),
  aircraft({ id: 3, serial_number: "AC-00003", status: "retired" }),
];

function serve({ list = page(fleet), due = [dueItem({ aircraft: 1, state: "overdue" })] } = {}) {
  const requests = { list: [] as URL[], due: [] as URL[] };
  server.use(
    http.get(apiUrl("/api/fleet/aircraft/"), ({ request }) => {
      requests.list.push(new URL(request.url));
      return HttpResponse.json(list);
    }),
    http.get(apiUrl("/api/fleet/aircraft-models/"), () => HttpResponse.json(models)),
    http.get(apiUrl("/api/maintenance/due/"), ({ request }) => {
      requests.due.push(new URL(request.url));
      return HttpResponse.json(due);
    }),
  );
  return requests;
}

const rowOf = (serial: string) => screen.getByRole("link", { name: serial }).closest("tr")!;

describe("AircraftList", () => {
  beforeEach(() => {
    nav.search = "";
    nav.push.mockClear();
  });

  it("joins maintenance state from one due-list request for the visible aircraft", async () => {
    const requests = serve();

    renderWithProviders(<AircraftList />);
    await screen.findByRole("link", { name: "AC-00001" });

    expect(await within(rowOf("AC-00001")).findByText("Overdue")).toBeInTheDocument();
    expect(within(rowOf("AC-00002")).getByText("No items due")).toBeInTheDocument();
    expect(within(rowOf("AC-00003")).getByText("—")).toBeInTheDocument();
    expect(requests.due).toHaveLength(1);
    expect(requests.due[0].searchParams.getAll("aircraft")).toEqual(["1", "2", "3"]);
    expect(requests.due[0].searchParams.getAll("state")).toEqual(["due_soon", "overdue"]);
  });

  it("shows usage counters and links to the aircraft", async () => {
    serve();

    renderWithProviders(<AircraftList />);

    await screen.findByRole("link", { name: "AC-00001" });
    const row = within(rowOf("AC-00001"));
    expect(row.getByText("120.5 h")).toBeInTheDocument();
    expect(row.getByText("240")).toBeInTheDocument();
    expect(row.getByText("Acme Hawk")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AC-00001" })).toHaveAttribute("href", "/aircraft/1");
  });

  it("passes URL filters and page to the API", async () => {
    nav.search = "status=grounded&model=1&page=2";
    const requests = serve({ list: page([aircraft({ status: "grounded" })], 60) });

    renderWithProviders(<AircraftList />);

    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    const query = requests.list[0].searchParams;
    expect(Object.fromEntries(query)).toEqual({ page: "2", status: "grounded", model: "1" });
  });

  it("ignores an unknown status in the URL", async () => {
    nav.search = "status=bogus";
    const requests = serve();

    renderWithProviders(<AircraftList />);

    await screen.findByRole("link", { name: "AC-00001" });
    expect(requests.list[0].searchParams.has("status")).toBe(false);
  });

  it("writes a status filter to the URL", async () => {
    serve();

    renderWithProviders(<AircraftList />);
    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    await userEvent.click(await screen.findByRole("option", { name: "Grounded" }));

    expect(nav.push).toHaveBeenCalledWith("/aircraft?status=grounded", { scroll: false });
  });

  it("skips the due-list request when there are no aircraft", async () => {
    nav.search = "status=grounded";
    const requests = serve({ list: page([]) });

    renderWithProviders(<AircraftList />);

    expect(await screen.findByText("No aircraft match these filters.")).toBeInTheDocument();
    expect(requests.due).toHaveLength(0);
  });
});
