import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { aircraft, page, workOrder, workOrderItem } from "@/test/fixtures";
import { apiUrl, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { WorkOrderList } from "./work-order-list";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/work-orders",
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

function serve(orders = page([workOrder({ items: [workOrderItem({ status: "signed_off" }), workOrderItem({ id: 8, task: 11 })] })])) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(apiUrl("/api/maintenance/work-orders/"), ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json(orders);
    }),
    http.get(apiUrl("/api/fleet/aircraft/"), () => HttpResponse.json(page([aircraft()]))),
  );
  return requests;
}

describe("WorkOrderList", () => {
  beforeEach(() => {
    nav.search = "";
    nav.push.mockClear();
  });

  it("lists work orders with status and progress", async () => {
    serve();

    renderWithProviders(<WorkOrderList />);

    const link = await screen.findByRole("link", { name: "WO-3" });
    expect(link).toHaveAttribute("href", "/work-orders/3");
    const row = within(link.closest("tr")!);
    expect(row.getByText("50 h inspection")).toBeInTheDocument();
    expect(row.getByText("Open")).toBeInTheDocument();
    expect(row.getByText("1 of 2 signed off")).toBeInTheDocument();
    expect(row.getByRole("link", { name: "AC-00001" })).toHaveAttribute("href", "/aircraft/1");
  });

  it("passes URL filters to the API", async () => {
    nav.search = "status=completed&aircraft=1";
    const requests = serve(page([]));

    renderWithProviders(<WorkOrderList />);

    expect(await screen.findByText("No work orders match these filters.")).toBeInTheDocument();
    expect(Object.fromEntries(requests[0])).toEqual({
      page: "1",
      status: "completed",
      aircraft: "1",
    });
  });

  it("writes the status filter to the URL", async () => {
    serve();

    renderWithProviders(<WorkOrderList />);
    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    await userEvent.click(await screen.findByRole("option", { name: "Cancelled" }));

    expect(nav.push).toHaveBeenCalledWith("/work-orders?status=cancelled", { scroll: false });
  });
});
