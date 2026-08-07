import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import { server } from "../../../test/server";
import { renderApp, screen } from "../../../test/render";
import { Leaderboard } from "./Leaderboard";
import { API_URL } from "../Home/Home";

const mockGetToken = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}));

beforeEach(() => {
  mockGetToken.mockReset();
  mockGetToken.mockResolvedValue("token-123");
});

/** The backend's actual wire shape — snake_case, email as the only identifying string. */
interface EntryResponse {
  id: string;
  email: string;
  watch_time_minutes: number;
  is_self: boolean;
}

function mockLeaderboard(entries: EntryResponse[]) {
  server.use(http.get(`${API_URL}/leaderboard`, () => HttpResponse.json(entries)));
}

// 29d 2h, per docs/design.md's exact example.
const TWENTY_NINE_DAYS_TWO_HOURS = 29 * 24 * 60 + 2 * 60;

const FOUR_ROWS: EntryResponse[] = [
  { id: "1", email: "priya@example.test", watch_time_minutes: TWENTY_NINE_DAYS_TWO_HOURS, is_self: false },
  { id: "2", email: "sam@example.test", watch_time_minutes: 20_000, is_self: false },
  { id: "3", email: "alex@example.test", watch_time_minutes: 15_000, is_self: true },
  { id: "4", email: "jo@example.test", watch_time_minutes: 5_000, is_self: false },
];

describe("Leaderboard", () => {
  it("shows a loading state while the request is in flight", () => {
    mockLeaderboard(FOUR_ROWS);
    renderApp(<Leaderboard />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("renders rows in rank order, with podium colors on the top three only", async () => {
    mockLeaderboard(FOUR_ROWS);
    renderApp(<Leaderboard />);

    const rows = await screen.findAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("priya@example.test"),
      expect.stringContaining("sam@example.test"),
      expect.stringContaining("alex@example.test"),
      expect.stringContaining("jo@example.test"),
    ]);

    const [first, second, third, fourth] = screen.getAllByText(/^[1-4]$/);
    expect(first).toHaveClass("text-gold");
    expect(second).toHaveClass("text-silver");
    expect(third).toHaveClass("text-bronze");
    expect(fourth).not.toHaveClass("text-gold");
    expect(fourth).not.toHaveClass("text-silver");
    expect(fourth).not.toHaveClass("text-bronze");
  });

  it("makes only the caller's row visually distinct, via outline, tint, and a YOU chip", async () => {
    mockLeaderboard(FOUR_ROWS);
    renderApp(<Leaderboard />);
    const rows = await screen.findAllByRole("listitem");

    expect(screen.getAllByText("YOU")).toHaveLength(1);

    const selfRow = rows[2]!; // alex@example.test, is_self: true
    expect(selfRow).toHaveClass("border-primary");
    expect(selfRow).toHaveClass("bg-primary/10");

    for (const [index, row] of rows.entries()) {
      if (index === 2) continue;
      expect(row).not.toHaveClass("border-primary");
      expect(row).not.toHaveClass("bg-primary/10");
    }
  });

  it("formats times right-aligned and tabular-aligned, like 29d 2h", async () => {
    mockLeaderboard(FOUR_ROWS);
    renderApp(<Leaderboard />);

    const time = await screen.findByText("29d 2h");
    expect(time).toHaveClass("text-right");
    expect(time).toHaveClass("tabular-nums");
  });

  it("shows an inviting empty state with an add-friend affordance when there are zero friends", async () => {
    mockLeaderboard([{ id: "1", email: "alex@example.test", watch_time_minutes: 100, is_self: true }]);
    const onAddFriend = vi.fn();
    renderApp(<Leaderboard onAddFriend={onAddFriend} />);

    await screen.findByText(/it's just you so far/i);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /add a friend/i }));
    expect(onAddFriend).toHaveBeenCalledOnce();
  });

  it("shows an inline error if the request fails", async () => {
    server.use(http.get(`${API_URL}/leaderboard`, () => HttpResponse.error()));
    renderApp(<Leaderboard />);
    await screen.findByRole("alert");
  });
});
