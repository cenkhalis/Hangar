/**
 * Query key factories. Each domain module adds its keys here, so invalidation after a mutation can
 * target exactly the queries it affects.
 */
export const queryKeys = {
  health: ["health"] as const,
};
