import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { completion, workOrder, workOrderItem } from "@/test/fixtures";
import { apiUrl, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { WorkOrderDetail } from "./work-order-detail";

const openOrder = workOrder({
  notes: "Bring spare props.",
  items: [
    workOrderItem({ id: 7, task: 10, status: "signed_off", completion: 100 }),
    workOrderItem({ id: 8, task: 11, task_code: "BAT-CHK", task_title: "Battery check" }),
  ],
});

function serve(order = openOrder) {
  let calls = 0;
  server.use(
    http.get(apiUrl(`/api/maintenance/work-orders/${order.id}/`), () => {
      calls += 1;
      return HttpResponse.json(order);
    }),
    http.get(apiUrl("/api/maintenance/completions/100/"), () =>
      HttpResponse.json(completion({ performed_by: "J. Doe" })),
    ),
  );
  return () => calls;
}

const renderDetail = () => renderWithProviders(<WorkOrderDetail id={3} />);

async function openSignOff() {
  renderDetail();
  await userEvent.click(await screen.findByRole("button", { name: "Sign off BAT-CHK" }));
  return screen.findByRole("dialog");
}

describe("WorkOrderDetail", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the work order, its items and who signed them off", async () => {
    serve();

    renderDetail();

    expect(
      await screen.findByRole("heading", { name: "WO-3 50 h inspection" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AC-00001" })).toHaveAttribute("href", "/aircraft/1");
    expect(screen.getByText("Bring spare props.")).toBeInTheDocument();
    expect(screen.getByText("· 1 of 2 signed off")).toBeInTheDocument();
    expect(await screen.findByText(/J\. Doe/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign off INS-50H" })).not.toBeInTheDocument();
  });

  it("signs off an item with the performed-at time in UTC and refreshes the order", async () => {
    const calls = serve();
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(apiUrl("/api/maintenance/work-order-items/8/sign-off/"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(completion({ id: 101, task_code: "BAT-CHK" }));
      }),
    );
    const dialog = await openSignOff();

    const performedAt = within(dialog).getByLabelText("Performed at");
    await userEvent.clear(performedAt);
    await userEvent.type(performedAt, "2026-10-02T14:30");
    await userEvent.type(within(dialog).getByLabelText("Performed by"), "A. Tech");
    await userEvent.type(within(dialog).getByLabelText("Notes"), "Cells balanced.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign off" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(body).toEqual({
      performed_at: new Date("2026-10-02T14:30").toISOString(),
      performed_by: "A. Tech",
      notes: "Cells balanced.",
    });
    await waitFor(() => expect(calls()).toBe(2));
  });

  it("accepts the default time for a work order opened earlier in the same minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T10:00:50Z"));
    serve(workOrder({ ...openOrder, opened_at: "2026-10-12T10:00:30Z" }));
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(apiUrl("/api/maintenance/work-order-items/8/sign-off/"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(completion({ id: 101, task_code: "BAT-CHK" }));
      }),
    );
    const dialog = await openSignOff();

    await userEvent.type(within(dialog).getByLabelText("Performed by"), "A. Tech");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign off" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(body?.performed_at).toBe("2026-10-12T10:00:50.000Z");
  });

  it("defaults the sign-off time to now", async () => {
    serve();
    const dialog = await openSignOff();

    const value = (within(dialog).getByLabelText("Performed at") as HTMLInputElement).value;
    expect(Math.abs(new Date(value).getTime() - Date.now())).toBeLessThan(2 * 60_000);
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(within(dialog).getByLabelText("Performed at")).toHaveAttribute("step", "1");
  });

  it("rejects a sign-off before the work order opened", async () => {
    serve();
    const dialog = await openSignOff();

    const performedAt = within(dialog).getByLabelText("Performed at");
    await userEvent.clear(performedAt);
    await userEvent.type(performedAt, "2026-09-30T10:00");
    await userEvent.type(within(dialog).getByLabelText("Performed by"), "A. Tech");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign off" }));

    expect(
      await within(dialog).findByText(/Cannot be before the work order opened/),
    ).toBeInTheDocument();
  });

  it("shows a domain error from signing off inside the dialog", async () => {
    serve();
    server.use(
      http.post(apiUrl("/api/maintenance/work-order-items/8/sign-off/"), () =>
        HttpResponse.json({ code: "item_not_pending", detail: "Item 8 is signed_off." }, { status: 409 }),
      ),
    );
    const dialog = await openSignOff();

    await userEvent.type(within(dialog).getByLabelText("Performed by"), "A. Tech");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign off" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Item is no longer pending");
    expect(alert).toHaveTextContent("Reload to see its current state.");
  });

  it("cancels the work order with a reason", async () => {
    serve();
    let body: unknown;
    server.use(
      http.post(apiUrl("/api/maintenance/work-orders/3/cancel/"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(workOrder({ status: "cancelled", cancel_reason: "Grounded" }));
      }),
    );
    renderDetail();

    await userEvent.click(await screen.findByRole("button", { name: "Cancel work order" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("1 signed-off item keeps its sign-off.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel work order" }));
    expect(await within(dialog).findByText("Required")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Reason"), "Grounded");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel work order" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(body).toEqual({ reason: "Grounded" });
  });

  it("shows the reason on a cancelled work order and offers no actions", async () => {
    serve(
      workOrder({
        status: "cancelled",
        closed_at: "2026-10-02T08:00:00Z",
        cancel_reason: "Aircraft grounded",
        items: [workOrderItem({ status: "cancelled" })],
      }),
    );

    renderDetail();

    expect(await screen.findByText("Aircraft grounded")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign off/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel work order" })).not.toBeInTheDocument();
  });
});
