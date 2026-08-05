import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import { server } from "../../../test/server";
import { renderApp, screen } from "../../../test/render";
import { Leaderboard, type LeaderboardEntry } from "./Leaderboard";

function mockLeaderboard(entries: LeaderboardEntry[]) {
  server.use(http.get("/leaderboard", () => HttpResponse.json(entries)));
}

// 29d 2h, per docs/design.md's exact example.
const TWENTY_NINE_DAYS_TWO_HOURS = 29 * 24 * 60 + 2 * 60;

const FOUR_ROWS: LeaderboardEntry[] = [
  { id: "1", name: "Priya Shah", avatarUrl: null, watchTimeMinutes: TWENTY_NINE_DAYS_TWO_HOURS, isSelf: false },
  { id: "2", name: "Sam Okafor", avatarUrl: null, watchTimeMinutes: 20_000, isSelf: false },
  { id: "3", name: "Alex Kim", avatarUrl: null, watchTimeMinutes: 15_000, isSelf: true },
  { id: "4", name: "Jo Rivera", avatarUrl: null, watchTimeMinutes: 5_000, isSelf: false },
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
      expect.stringContaining("Priya Shah"),
      expect.stringContaining("Sam Okafor"),
      expect.stringContaining("Alex Kim"),
      expect.stringContaining("Jo Rivera"),
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

    const selfRow = rows[2]!; // Alex Kim, isSelf: true
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
    mockLeaderboard([{ id: "1", name: "Alex Kim", avatarUrl: null, watchTimeMinutes: 100, isSelf: true }]);
    const onAddFriend = vi.fn();
    renderApp(<Leaderboard onAddFriend={onAddFriend} />);

    await screen.findByText(/it's just you so far/i);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /add a friend/i }));
    expect(onAddFriend).toHaveBeenCalledOnce();
  });

  it("shows an inline error if the request fails", async () => {
    server.use(http.get("/leaderboard", () => HttpResponse.error()));
    renderApp(<Leaderboard />);
    await screen.findByRole("alert");
  });
});
