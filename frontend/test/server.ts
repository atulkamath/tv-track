import { setupServer } from "msw/node";

/**
 * The frontend's network seam for tests. No handlers are registered yet —
 * nothing calls the network — but every later ticket that fetches from the
 * backend adds handlers here via `server.use(...)` per test, rather than
 * hitting a real API.
 */
export const server = setupServer();
