import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { renderApp, screen, waitFor } from "../../../test/render";
import { WatchTimeDisplay, useWatchTime, API_URL } from "./WatchTimeStat";

/** Stands in for how Home wires the hook to a display — the shape these tests always exercised. */
function WatchTimeStat({ variant, refreshKey }: { variant: "sidebar" | "topStrip"; refreshKey?: number }) {
  const state = useWatchTime(refreshKey);
  if (state.status !== "ready") return null;
  return <WatchTimeDisplay variant={variant} minutes={state.minutes} rank={state.rank} />;
}

const mockGetToken = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}));

beforeEach(() => {
  mockGetToken.mockReset();
  mockGetToken.mockResolvedValue("token-123");
});

function mockLeaderboard(entries: { id: string; watch_time_minutes: number; is_self: boolean }[]) {
  server.use(http.get(`${API_URL}/leaderboard`, () => HttpResponse.json(entries)));
}

describe("WatchTimeStat", () => {
  it("renders the caller's formatted Watch Time and 1-based rank in the sidebar variant", async () => {
    mockLeaderboard([
      { id: "u2", watch_time_minutes: 5000, is_self: false },
      { id: "u1", watch_time_minutes: 260, is_self: true },
    ]);
    renderApp(<WatchTimeStat variant="sidebar" />);

    expect(await screen.findByText("4h 20m")).toBeInTheDocument();
    expect(screen.getByText("Rank #2")).toBeInTheDocument();
    expect(screen.getByText("Watch Time")).toBeInTheDocument();
  });

  it("renders a compact single line in the topStrip variant", async () => {
    mockLeaderboard([{ id: "u1", watch_time_minutes: 260, is_self: true }]);
    renderApp(<WatchTimeStat variant="topStrip" />);

    expect(await screen.findByText("4h 20m")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.queryByText("Watch Time")).not.toBeInTheDocument();
  });

  it("works with zero friends — the caller is still the only, first-ranked entry", async () => {
    mockLeaderboard([{ id: "u1", watch_time_minutes: 90, is_self: true }]);
    renderApp(<WatchTimeStat variant="sidebar" />);

    expect(await screen.findByText("1h 30m")).toBeInTheDocument();
    expect(screen.getByText("Rank #1")).toBeInTheDocument();
  });

  it("renders nothing while loading or on failure — quiet chrome, not an alert", async () => {
    server.use(http.get(`${API_URL}/leaderboard`, () => HttpResponse.error()));
    const { container } = renderApp(<WatchTimeStat variant="sidebar" />);

    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("never calls the backend before Clerk has produced a token", () => {
    mockGetToken.mockResolvedValue(null);
    server.use(
      http.get(`${API_URL}/leaderboard`, () => {
        throw new Error("should not be called without a token");
      }),
    );
    expect(() => renderApp(<WatchTimeStat variant="sidebar" />)).not.toThrow();
  });

  it("refetches when refreshKey changes", async () => {
    mockLeaderboard([{ id: "u1", watch_time_minutes: 60, is_self: true }]);
    const { rerender } = renderApp(<WatchTimeStat variant="sidebar" refreshKey={0} />);
    await screen.findByText("1h 0m");

    mockLeaderboard([{ id: "u1", watch_time_minutes: 120, is_self: true }]);
    rerender(<WatchTimeStat variant="sidebar" refreshKey={1} />);

    expect(await screen.findByText("2h 0m")).toBeInTheDocument();
  });
});
