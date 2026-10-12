import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { aircraft, completion, interval, page, taskStatus } from "@/test/fixtures";
import { apiUrl, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";

import { AircraftMaintenance } from "./aircraft-maintenance";

const nav = vi.hoisted(() => ({ search: "tab=maintenance", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/aircraft/1",
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const report = {
  aircraft: 1,
  state: "overdue",
  tasks: [
    taskStatus({
      state: "overdue",
      intervals: [
        interval({ remaining: "-2.50", state: "overdue", due_at_aircraft_hours: "118.00" }),
        interval({
          interval_type: "calendar_days",
          interval: "90.00",
          remaining: "30.00",
          due_date: "2026-11-11",
          due_at_aircraft_hours: null,
        }),
      ],
      last_completion: {
        id: 100,
        kind: "historical",
        performed_at: "2026-07-01T09:00:00Z",
        performed_by: "J. Doe",
      },
    }),
    taskStatus({ task: 11, code: "BAT-CHK", title: "Battery check", intervals: [] }),
  ],
};

function serve({ history = [completion(), completion({ id: 101, kind: "historical", work_order: null, work_order_item: null })] } = {}) {
  const calls = { status: 0, completions: 0 };
  server.use(
    http.get(apiUrl("/api/maintenance/aircraft/1/status/"), () => {
      calls.status += 1;
      return HttpResponse.json(report);
    }),
    http.get(apiUrl("/api/maintenance/completions/"), () => {
      calls.completions += 1;
      return HttpResponse.json(page(history));
    }),
  );
  return calls;
}

const renderTab = () => renderWithProviders(<AircraftMaintenance aircraft={aircraft()} />);

describe("AircraftMaintenance", () => {
  beforeEach(() => {
    nav.push.mockClear();
  });

  it("shows each task's state, intervals and last sign-off", async () => {
    serve();

    renderTab();

    const table = await screen.findByRole("table", { name: "Task status" });
    const row = within(await within(table).findByText("INS-50H").then((el) => el.closest("tr")!));
    expect(row.getByText("Overdue")).toBeInTheDocument();
    expect(row.getByText(/Every 50 h · 2\.5 h over/)).toHaveTextContent("due at 118 h");
    expect(row.getByText(/Every 90 days · 30 days left/)).toHaveTextContent("due 11 Nov 2026");
    expect(row.getByText(/J\. Doe/)).toHaveTextContent("(historical)");
  });

  it("labels the source of each sign-off in the history", async () => {
    serve();

    renderTab();

    const history = await screen.findByRole("table", { name: "Sign-off history" });
    expect(await within(history).findByText("WO-3")).toBeInTheDocument();
    expect(within(history).getByText("Historical")).toBeInTheDocument();
  });

  it("explains an aircraft model without a maintenance program", async () => {
    server.use(
      http.get(apiUrl("/api/maintenance/aircraft/1/status/"), () =>
        HttpResponse.json({ aircraft: 1, state: "untracked", tasks: [] }),
      ),
      http.get(apiUrl("/api/maintenance/completions/"), () => HttpResponse.json(page([]))),
    );

    renderTab();

    expect(
      await screen.findByText("No maintenance program for Acme Hawk. Set one up in Django admin."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record historical sign-off" })).toBeDisabled();
  });

  it("voids a sign-off with a reason and refreshes maintenance data", async () => {
    const calls = serve({ history: [completion()] });
    let body: unknown;
    server.use(
      http.post(apiUrl("/api/maintenance/completions/100/void/"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(completion({ voided: true, void_reason: "Wrong aircraft" }));
      }),
    );

    renderTab();
    await userEvent.click(await screen.findByRole("button", { name: "Void INS-50H sign-off" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Void sign-off" }));
    expect(await within(dialog).findByText("Required")).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText("Reason"), "Wrong aircraft");
    await userEvent.click(within(dialog).getByRole("button", { name: "Void sign-off" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(body).toEqual({ reason: "Wrong aircraft" });
    await waitFor(() => expect(calls.status).toBe(2));
    expect(calls.completions).toBe(2);
  });

  it("shows a domain error from voiding inside the dialog", async () => {
    serve({ history: [completion()] });
    server.use(
      http.post(apiUrl("/api/maintenance/completions/100/void/"), () =>
        HttpResponse.json(
          { code: "completion_already_voided", detail: "Completion 100 is already voided." },
          { status: 409 },
        ),
      ),
    );

    renderTab();
    await userEvent.click(await screen.findByRole("button", { name: "Void INS-50H sign-off" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Reason"), "Duplicate");
    await userEvent.click(within(dialog).getByRole("button", { name: "Void sign-off" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Sign-off already voidedCompletion 100 is already voided.",
    );
  });

  describe("historical sign-off", () => {
    async function openForm() {
      renderTab();
      await userEvent.click(await screen.findByRole("button", { name: "Record historical sign-off" }));
      return screen.findByRole("dialog");
    }

    async function fillForm(dialog: HTMLElement) {
      await userEvent.click(within(dialog).getByRole("combobox"));
      await userEvent.click(await screen.findByRole("option", { name: "BAT-CHK Battery check" }));
      await userEvent.type(within(dialog).getByLabelText("Performed at"), "2026-06-01T10:30");
      await userEvent.type(within(dialog).getByLabelText("Performed by"), "  A. Tech ");
    }

    it("validates required fields before submitting", async () => {
      serve();
      const dialog = await openForm();

      await userEvent.click(within(dialog).getByRole("button", { name: "Record sign-off" }));

      expect(await within(dialog).findAllByText("Required")).toHaveLength(3);
    });

    it("submits the sign-off as UTC and refreshes maintenance data", async () => {
      const calls = serve();
      let body: Record<string, unknown> | undefined;
      server.use(
        http.post(apiUrl("/api/maintenance/completions/"), async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(completion({ id: 200, task: 11, task_code: "BAT-CHK" }), {
            status: 201,
          });
        }),
      );
      const dialog = await openForm();

      await fillForm(dialog);
      await userEvent.click(within(dialog).getByRole("button", { name: "Record sign-off" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(body).toEqual({
        aircraft: 1,
        task: 11,
        performed_at: new Date("2026-06-01T10:30").toISOString(),
        performed_by: "A. Tech",
        notes: "",
      });
      await waitFor(() => expect(calls.status).toBe(2));
    });

    it("attaches server field errors to their fields", async () => {
      serve();
      server.use(
        http.post(apiUrl("/api/maintenance/completions/"), () =>
          HttpResponse.json({ performed_at: ["performed_at cannot be in the future."] }, { status: 400 }),
        ),
      );
      const dialog = await openForm();

      await fillForm(dialog);
      await userEvent.click(within(dialog).getByRole("button", { name: "Record sign-off" }));

      expect(await within(dialog).findByText("performed_at cannot be in the future.")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Performed at")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("shows a domain error at the top of the form", async () => {
      serve();
      server.use(
        http.post(apiUrl("/api/maintenance/completions/"), () =>
          HttpResponse.json(
            { code: "task_not_in_program", detail: "Task BAT-CHK is not in the program for AC-00001." },
            { status: 400 },
          ),
        ),
      );
      const dialog = await openForm();

      await fillForm(dialog);
      await userEvent.click(within(dialog).getByRole("button", { name: "Record sign-off" }));

      const alerts = await within(dialog).findAllByRole("alert");
      expect(alerts[0]).toHaveTextContent("Task not available for this aircraft");
    });
  });
});
