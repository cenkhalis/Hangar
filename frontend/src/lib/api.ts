const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!response.ok) {
    throw new ApiError(response.status, `${init?.method ?? "GET"} ${path} failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export type HealthResponse = {
  status: "ok" | "unavailable";
  checks: { database: "ok" | "unavailable" };
};

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/health/");
}
