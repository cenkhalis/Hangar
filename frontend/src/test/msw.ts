import { setupServer } from "msw/node";

import { API_URL } from "@/lib/api/client";

/** Shared MSW server; tests register handlers with `server.use(...)`. */
export const server = setupServer();

export const apiUrl = (path: string) => `${API_URL}${path}`;
