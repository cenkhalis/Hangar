import { randomUUID } from "node:crypto";

/**
 * A unique id for records a test creates. `Date.now()` alone collides when parallel workers start
 * in the same millisecond.
 */
export function runId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}
