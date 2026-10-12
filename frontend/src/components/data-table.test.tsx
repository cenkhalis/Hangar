import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";

import { columnHelper, DataTable } from "./data-table";

type Row = { id: number; serial: string; hours: string };

const helper = columnHelper<Row>();
const columns = helper.columns([
  helper.accessor("serial", { header: "Serial" }),
  helper.accessor("hours", { header: "Hours", cell: (info) => `${info.getValue()} h` }),
]);

const rows: Row[] = [
  { id: 1, serial: "AC-00001", hours: "12.50" },
  { id: 2, serial: "AC-00002", hours: "3.00" },
];

describe("DataTable", () => {
  it("renders headers and cells", () => {
    render(<DataTable label="Aircraft" columns={columns} data={rows} />);

    const table = screen.getByRole("table", { name: "Aircraft" });
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Serial",
      "Hours",
    ]);
    expect(within(table).getByText("12.50 h")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("marks the table busy and hides pagination while loading", () => {
    render(
      <DataTable
        label="Aircraft"
        columns={columns}
        data={undefined}
        isPending
        pagination={{ page: 1, count: 120, onPageChange: () => {} }}
      />,
    );

    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it("shows the empty message when there are no rows", () => {
    render(
      <DataTable label="Aircraft" columns={columns} data={[]} emptyMessage="No aircraft yet." />,
    );

    expect(screen.getByText("No aircraft yet.")).toBeInTheDocument();
  });

  it("shows the error with a retry action instead of the table", async () => {
    const onRetry = vi.fn();
    const error = new ApiError(0, "network_error", "Failed to fetch");

    render(
      <DataTable label="Aircraft" columns={columns} data={undefined} error={error} onRetry={onRetry} />,
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Cannot reach the server");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("pages through server results", async () => {
    const onPageChange = vi.fn();

    render(
      <DataTable
        label="Aircraft"
        columns={columns}
        data={rows}
        pagination={{ page: 2, count: 120, onPageChange }}
      />,
    );

    const pager = screen.getByRole("navigation", { name: "Pagination" });
    expect(pager).toHaveTextContent("120 results");
    expect(pager).toHaveTextContent("Page 2 of 3");
    await userEvent.click(within(pager).getByRole("button", { name: /Previous/ }));
    await userEvent.click(within(pager).getByRole("button", { name: /Next/ }));
    expect(onPageChange.mock.calls).toEqual([[1], [3]]);
  });
});
