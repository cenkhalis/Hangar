import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { dueItem, interval, page } from "@/test/fixtures";
import { apiUrl, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { Dashboard } from "./dashboard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const AIRCRAFT = { active: 7, grounded: 2, retired: 1 } as Record<string, number>;

/** Count endpoints answer with `count` and a single row, as `page_size=1` asks. */
function countPage(count: number) {
  return { ...page([], count), results: count > 0 ? [{}] : [] };
}

function serve({ due = [dueItem({ state: "overdue" }), dueItem({ aircraft: 2, aircraft_serial: "AC-00002", task: 11, code: "BAT-CHK", title: "Battery check" })] } = {}) {
  const listRequests: URL[] = [];
  const record = (request: Request) => {
    const url = new URL(request.url);
    listRequests.push(url);
    return url.searchParams;
  };
  server.use(
    http.get(apiUrl("/api/fleet/aircraft/"), ({ request }) =>
      HttpResponse.json(countPage(AIRCRAFT[record(request).get("status")!])),
    ),
    http.get(apiUrl("/api/maintenance/work-orders/"), ({ request }) => {
      record(request);
      return HttpResponse.json(countPage(4));
    }),
    http.get(apiUrl("/api/flights/logs/"), ({ request }) => {
      record(request);
      return HttpResponse.json(countPage(3));
    }),
    http.get(apiUrl("/api/maintenance/due/"), () => HttpResponse.json(due)),
  );
  return listRequests;
}

const card = (label: string) =>
  screen.getByText(label, { selector: "[data-slot=card-description]" }).closest("[data-slot=card]")!;

async function cardValue(label: string) {
  await waitFor(() => expect(within(card(label) as HTMLElement).queryByText(/^\d/)).not.toBeNull());
  return within(card(label) as HTMLElement).getByText(/^\d/).textContent;
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads every KPI from a one-row count query", async () => {
    const requests = serve();

    renderWithProviders(<Dashboard />);

    expect(await cardValue("Open work orders")).toBe("4");
    expect(await cardValue("Rejected flight logs")).toBe("3");
    expect(await cardValue("Total aircraft")).toBe("10");
    expect(requests).toHaveLength(5);
    for (const url of requests) expect(url.searchParams.get("page_size")).toBe("1");
    expect(requests.map((u) => `${u.pathname}?${u.searchParams.get("status")}`).sort()).toEqual([
      "/api/fleet/aircraft/?active",
      "/api/fleet/aircraft/?grounded",
      "/api/fleet/aircraft/?retired",
      "/api/flights/logs/?rejected",
      "/api/maintenance/work-orders/?open",
    ]);
  });

  it("breaks the fleet down by status with links to each list", async () => {
    serve();

    renderWithProviders(<Dashboard />);

    expect(await cardValue("Active")).toBe("7");
    expect(await cardValue("Grounded")).toBe("2");
    expect(await cardValue("Retired")).toBe("1");
    expect(screen.getByRole("link", { name: "Grounded aircraft" })).toHaveAttribute(
      "href",
      "/aircraft?status=grounded",
    );
  });

  it("flags overdue tasks as critical and due-soon tasks as a warning", async () => {
    serve();

    renderWithProviders(<Dashboard />);

    expect(await cardValue("Overdue tasks")).toBe("1");
    expect(card("Overdue tasks")).toHaveAttribute("data-tone", "critical");
    expect(card("Overdue tasks")).toHaveTextContent("(Action required)");
    expect(card("Due soon")).toHaveAttribute("data-tone", "warning");
    expect(screen.getByRole("link", { name: "Overdue tasks" })).toHaveAttribute(
      "href",
      "/maintenance?state=overdue",
    );
  });

  it("does not flag zero counts", async () => {
    serve({ due: [] });

    renderWithProviders(<Dashboard />);

    expect(await cardValue("Overdue tasks")).toBe("0");
    expect(card("Overdue tasks")).not.toHaveAttribute("data-tone");
    expect(screen.getByText("Nothing is due soon or overdue.")).toBeInTheDocument();
  });

  it("lists the most urgent tasks with what remains", async () => {
    serve({
      due: [
        dueItem({
          state: "overdue",
          intervals: [interval({ remaining: "-2.50", state: "overdue" })],
        }),
      ],
    });

    renderWithProviders(<Dashboard />);

    const urgent = await screen.findByRole("link", { name: "AC-00001" });
    expect(urgent).toHaveAttribute("href", "/aircraft/1?tab=maintenance");
    expect(urgent.closest("li")).toHaveTextContent("INS-50H 50 hour inspection2.5 h over");
  });

  it("shows a failed KPI as unavailable and retries it", async () => {
    serve();
    let calls = 0;
    server.use(
      http.get(apiUrl("/api/maintenance/work-orders/"), () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ detail: "boom" }, { status: 500 })
          : HttpResponse.json(countPage(4));
      }),
    );

    renderWithProviders(<Dashboard />);

    const openOrders = card("Open work orders") as HTMLElement;
    await within(openOrders).findByText("Unavailable", {}, { timeout: 3000 });
    await userEvent.click(within(openOrders).getByRole("button", { name: "Retry" }));
    expect(await cardValue("Open work orders")).toBe("4");
  });

  it("opens the work order dialog from the quick actions", async () => {
    serve();
    server.use(http.get(apiUrl("/api/fleet/aircraft/"), () => HttpResponse.json(page([]))));

    renderWithProviders(<Dashboard />);
    expect(screen.getByRole("link", { name: "Ingest review" })).toHaveAttribute(
      "href",
      "/flight-logs?status=rejected",
    );
    expect(screen.getByRole("link", { name: "Due board" })).toHaveAttribute("href", "/maintenance");
    await userEvent.click(screen.getByRole("button", { name: "New work order" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("Create work order");
  });
});
