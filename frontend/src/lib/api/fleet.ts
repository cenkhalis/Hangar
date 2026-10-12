import { api, type Schemas, unwrap } from "./client";
import { fetchAllPages } from "./pagination";

export type Aircraft = Schemas["Aircraft"];
export type AircraftStatus = Schemas["AircraftStatusEnum"];
export type AircraftModel = Schemas["AircraftModel"];
export type ComponentType = Schemas["ComponentType"];
export type Airworthiness = Schemas["Airworthiness"];
export type InstalledComponentStatus = Schemas["InstalledComponentStatus"];

export type AircraftFilters = { page: number; status?: AircraftStatus; model?: number };

export function listAircraft({ page, status, model }: AircraftFilters) {
  return unwrap(api.GET("/api/fleet/aircraft/", { params: { query: { page, status, model } } }));
}

export function getAircraft(id: number): Promise<Aircraft> {
  return unwrap(api.GET("/api/fleet/aircraft/{id}/", { params: { path: { id } } }));
}

export function getAirworthiness(id: number): Promise<Airworthiness> {
  return unwrap(api.GET("/api/fleet/aircraft/{id}/airworthiness/", { params: { path: { id } } }));
}

export function listAllAircraftModels(): Promise<AircraftModel[]> {
  return fetchAllPages((page) =>
    unwrap(api.GET("/api/fleet/aircraft-models/", { params: { query: { page } } })),
  );
}

export function listAllComponentTypes(): Promise<ComponentType[]> {
  return fetchAllPages((page) =>
    unwrap(api.GET("/api/fleet/component-types/", { params: { query: { page } } })),
  );
}
