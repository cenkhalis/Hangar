import { api, type Schemas, unwrap } from "./client";

export type Flight = Schemas["Flight"];

export type FlightFilters = { page: number; aircraft?: number };

export function listFlights({ page, aircraft }: FlightFilters) {
  return unwrap(api.GET("/api/flights/flights/", { params: { query: { page, aircraft } } }));
}
