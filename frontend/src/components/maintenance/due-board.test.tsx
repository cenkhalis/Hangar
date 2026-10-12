import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { aircraft, dueItem, interval, page, taskStatus } from "@/test/fixtures";
import { apiUrl, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { DueBoard } from "./due-board";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/maintenance",
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const items = [
  dueItem({
    aircraft: 2,
    aircraft_serial: "AC-00002",
    task: 11,
    code: "BAT-CHK",
    title: "Battery check",
    state: "overdue",
    intervals: [
      interval({
        interval_type: "calendar_days",
        interval: "30.00",
        remaining: "-4.00",
        state: "overdue",
        due_date: "2026-10-08",
        due_at_aircraft_hours: null,
      }),
    ],
  }),
  dueItem(),
];

function serve(due = items) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(apiUrl("/api/maintenance/due/"), ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json(due);
    }),
    http.get(apiUrl("/api/fleet/aircraft/"), () =>
      HttpResponse.json(page([aircraft(), aircraft({ id: 2, serial_number: "AC-00002" })])),
    ),
  );
  return requests;
}

describe("DueBoard", () => {
  beforeEach(() => {
    nav.search = "";
    nav.push.mockClear();
  });

  it("lists due tasks in the API's severity order with what remains", async () => {
    const requests = serve();

    renderWithProviders(<DueBoard />);

    const table = await screen.findByRole("table", { name: "Due tasks" });
    await within(table).findByText("BAT-CHK");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Overdue")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("4 days over · due 8 Oct 2026");
    expect(within(rows[1]).getByText("Due soon")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link", { name: "AC-00002" })).toHaveAttribute(
      "href",
      "/aircraft/2?tab=maintenance",
    );
    // No state filter: the API default (due soon and overdue) applies.
    expect([...requests[0].keys()]).toEqual([]);
  });

  it("passes URL filters to the API", async () => {
    nav.search = "state=overdue&aircraft=2";
    const requests = serve([items[0]]);

    renderWithProviders(<DueBoard />);

    await screen.findByText("BAT-CHK");
    expect(requests[0].getAll("state")).toEqual(["overdue"]);
    expect(requests[0].getAll("aircraft")).toEqual(["2"]);
  });

  it("says when nothing is due", async () => {
    serve([]);

    renderWithProviders(<DueBoard />);

    expect(await screen.findByText("Nothing is due soon or overdue.")).toBeInTheDocument();
  });

  it("opens a work order dialog for the row's aircraft with its task selected", async () => {
    serve();
    server.use(
      http.get(apiUrl("/api/maintenance/aircraft/2/status/"), () =>
        HttpResponse.json({
          aircraft: 2,
          state: "overdue",
          tasks: [
            taskStatus({ task: 10, state: "due_soon" }),
            taskStatus({ task: 11, code: "BAT-CHK", title: "Battery check", state: "overdue" }),
          ],
        }),
      ),
      http.get(apiUrl("/api/maintenance/work-orders/"), () => HttpResponse.json(page([]))),
    );

    renderWithProviders(<DueBoard />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Create work order for BAT-CHK on AC-00002" }),
    );

    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByRole("checkbox", { name: /BAT-CHK/ })).toBeChecked(),
    );
    expect(within(dialog).getByRole("checkbox", { name: /INS-50H/ })).not.toBeChecked();
    expect(within(dialog).getByRole("combobox", { name: "Aircraft" })).toHaveTextContent("AC-00002");
  });
});
