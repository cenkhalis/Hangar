import { api, type Schemas, unwrap } from "./client";

export type Health = Schemas["Health"];

export function getHealth(): Promise<Health> {
  return unwrap(api.GET("/api/health/"));
}
