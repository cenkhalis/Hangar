import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, getHealth } from "@/lib/api";

import { HealthStatus } from "./health-status";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getHealth: vi.fn(),
}));

const getHealthMock = vi.mocked(getHealth);

function renderWithClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HealthStatus />
    </QueryClientProvider>,
  );
}

describe("HealthStatus", () => {
  beforeEach(() => {
    getHealthMock.mockReset();
  });

  it("shows online when the backend is healthy", async () => {
    getHealthMock.mockResolvedValue({ status: "ok", checks: { database: "ok" } });

    renderWithClient();

    expect(await screen.findByText("Backend online")).toBeInTheDocument();
  });

  it("shows unavailable when the request fails", async () => {
    getHealthMock.mockRejectedValue(new ApiError(503, "down"));

    renderWithClient();

    expect(await screen.findByText("Backend unavailable")).toBeInTheDocument();
  });

  it("refetches when Retry is clicked", async () => {
    getHealthMock
      .mockRejectedValueOnce(new ApiError(503, "down"))
      .mockResolvedValueOnce({ status: "ok", checks: { database: "ok" } });

    renderWithClient();
    await screen.findByText("Backend unavailable");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Backend online")).toBeInTheDocument();
    expect(getHealthMock).toHaveBeenCalledTimes(2);
  });
});
