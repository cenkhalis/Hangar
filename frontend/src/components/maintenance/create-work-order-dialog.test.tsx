import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { aircraft, page, taskStatus, workOrder, workOrderItem } from "@/test/fixtures";
import { apiUrl, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { CreateWorkOrderDialog } from "./create-work-order-dialog";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }));

const report = {
  aircraft: 1,
  state: "overdue",
  tasks: [
    taskStatus({ task: 10, code: "INS-50H", title: "50 hour inspection", state: "overdue" }),
    taskStatus({ task: 11, code: "BAT-CHK", title: "Battery check", state: "ok" }),
    taskStatus({ task: 12, code: "PROP-INS", title: "Propeller inspection", state: "due_soon" }),
  ],
};

/** Task 12 is already pending on WO-8. */
const openOrders = page([workOrder({ id: 8, items: [workOrderItem({ task: 12 })] })]);

function serve() {
  const calls = { openOrders: 0 };
  server.use(
    http.get(apiUrl("/api/fleet/aircraft/"), () =>
      HttpResponse.json(
        page([
          aircraft(),
          aircraft({ id: 2, serial_number: "AC-00002" }),
          aircraft({ id: 3, serial_number: "AC-00003", status: "retired" }),
        ]),
      ),
    ),
    http.get(apiUrl("/api/maintenance/aircraft/:id/status/"), ({ params }) =>
      HttpResponse.json(
        params.id === "1" ? report : { aircraft: 2, state: "untracked", tasks: [] },
      ),
    ),
    http.get(apiUrl("/api/maintenance/work-orders/"), ({ request }) => {
      calls.openOrders += 1;
      const query = new URL(request.url).searchParams;
      expect(query.get("status")).toBe("open");
      return HttpResponse.json(query.get("aircraft") === "1" ? openOrders : page([]));
    }),
  );
  return calls;
}

const checkbox = (name: RegExp) => screen.getByRole("checkbox", { name });

describe("CreateWorkOrderDialog", () => {
  beforeEach(() => {
    nav.push.mockClear();
  });

  it("preselects due tasks and blocks tasks already on an open work order", async () => {
    serve();

    renderWithProviders(<CreateWorkOrderDialog open onOpenChange={() => {}} aircraftId={1} />);

    await waitFor(() => expect(checkbox(/INS-50H/)).toBeChecked());
    expect(checkbox(/BAT-CHK/)).not.toBeChecked();
    expect(checkbox(/PROP-INS/)).toBeDisabled();
    expect(checkbox(/PROP-INS/)).not.toBeChecked();
    expect(screen.getByText("On WO-8")).toBeInTheDocument();
  });

  it("preselects only the requested tasks", async () => {
    serve();

    renderWithProviders(
      <CreateWorkOrderDialog open onOpenChange={() => {}} aircraftId={1} taskIds={[11]} />,
    );

    await waitFor(() => expect(checkbox(/BAT-CHK/)).toBeChecked());
    expect(checkbox(/INS-50H/)).not.toBeChecked();
  });

  it("requires an aircraft, a task and a title", async () => {
    serve();
    renderWithProviders(<CreateWorkOrderDialog open onOpenChange={() => {}} />);

    await userEvent.click(await screen.findByRole("button", { name: "Create work order" }));

    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText("Select at least one task")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Required")).toHaveLength(2);
  });

  it("offers only aircraft that are not retired, and loads tasks for the chosen one", async () => {
    serve();
    renderWithProviders(<CreateWorkOrderDialog open onOpenChange={() => {}} />);

    await userEvent.click(await screen.findByRole("combobox", { name: "Aircraft" }));
    expect(screen.queryByRole("option", { name: "AC-00003" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("option", { name: "AC-00001" }));

    await waitFor(() => expect(checkbox(/INS-50H/)).toBeChecked());
  });

  it("creates the work order and opens it", async () => {
    serve();
    let body: unknown;
    server.use(
      http.post(apiUrl("/api/maintenance/work-orders/"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(workOrder({ id: 21 }), { status: 201 });
      }),
    );
    const onOpenChange = vi.fn();
    renderWithProviders(<CreateWorkOrderDialog open onOpenChange={onOpenChange} aircraftId={1} />);

    await waitFor(() => expect(checkbox(/INS-50H/)).toBeChecked());
    await userEvent.click(checkbox(/BAT-CHK/));
    await userEvent.type(screen.getByLabelText("Title"), "Weekly check");
    await userEvent.click(screen.getByRole("button", { name: "Create work order" }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/work-orders/21"));
    expect(body).toEqual({ aircraft: 1, tasks: [10, 11], title: "Weekly check", notes: "" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows duplicate_open_task inline and refreshes the open work orders", async () => {
    const calls = serve();
    server.use(
      http.post(apiUrl("/api/maintenance/work-orders/"), () =>
        HttpResponse.json(
          { code: "duplicate_open_task", detail: "Task INS-50H is already pending on work order 9." },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(<CreateWorkOrderDialog open onOpenChange={() => {}} aircraftId={1} />);

    await waitFor(() => expect(checkbox(/INS-50H/)).toBeChecked());
    await userEvent.type(screen.getByLabelText("Title"), "Weekly check");
    const before = calls.openOrders;
    await userEvent.click(screen.getByRole("button", { name: "Create work order" }));

    const alert = await within(screen.getByRole("dialog")).findByRole("alert");
    expect(alert).toHaveTextContent("Task already on an open work order");
    expect(alert).toHaveTextContent("Task INS-50H is already pending on work order 9.");
    expect(nav.push).not.toHaveBeenCalled();
    await waitFor(() => expect(calls.openOrders).toBe(before + 1));
  });
});
