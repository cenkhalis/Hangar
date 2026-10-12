import { api, type Schemas, unwrap } from "./client";

export type Flight = Schemas["Flight"];
export type FlightLog = Schemas["FlightLog"];
export type FlightLogStatus = Schemas["FlightLogStatusEnum"];
export type RejectionCode = Schemas["RejectionCodeEnum"];

export type FlightFilters = {
  page: number;
  aircraft?: number;
  /** ISO datetime; inclusive. */
  departure_after?: string;
  /** ISO datetime; exclusive. */
  departure_before?: string;
};

export function listFlights(query: FlightFilters) {
  return unwrap(api.GET("/api/flights/flights/", { params: { query } }));
}

export function getFlight(id: number): Promise<Flight> {
  return unwrap(api.GET("/api/flights/flights/{id}/", { params: { path: { id } } }));
}

export type FlightLogFilters = {
  page: number;
  status?: FlightLogStatus;
  rejection_code?: RejectionCode;
};

export function listFlightLogs(query: FlightLogFilters) {
  return unwrap(api.GET("/api/flights/logs/", { params: { query } }));
}

export function getFlightLog(id: number): Promise<FlightLog> {
  return unwrap(api.GET("/api/flights/logs/{id}/", { params: { path: { id } } }));
}

/** Retry a rejected log; the response says whether it was processed or rejected again. */
export function reprocessFlightLog(id: number): Promise<FlightLog> {
  return unwrap(api.POST("/api/flights/logs/{id}/reprocess/", { params: { path: { id } } }));
}
