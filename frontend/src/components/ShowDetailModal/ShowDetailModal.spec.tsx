import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import { server } from "../../../test/server";
import { renderApp, screen, within } from "../../../test/render";
import { ShowDetailModal, API_URL } from "./ShowDetailModal";

const mockGetToken = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}));

beforeEach(() => {
  mockGetToken.mockReset();
  mockGetToken.mockResolvedValue("token-123");
});

const SHOW_ID = "show-1";

function showDetail(overrides?: { season1Episode2Watched?: boolean }) {
  return {
    id: SHOW_ID,
    title: "Breaking Bad",
    poster_path: "/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg",
    seasons: [
      {
        season_number: 1,
        watch_state: "partial",
        episodes: [
          { id: "e1", episode_number: 1, runtime_minutes: 45, watched: true },
          { id: "e2", episode_number: 2, runtime_minutes: 47, watched: overrides?.season1Episode2Watched ?? false },
        ],
      },
      {
        season_number: 2,
        watch_state: "none",
        episodes: [{ id: "e3", episode_number: 1, runtime_minutes: 50, watched: false }],
      },
    ],
  };
}

function mockDetail(body: Record<string, unknown> = showDetail()) {
  server.use(http.get(`${API_URL}/shows/${SHOW_ID}`, () => HttpResponse.json(body)));
}

describe("ShowDetailModal", () => {
  it("renders the header (title, watched-of-total count) and seasons collapsed by default", async () => {
    mockDetail();
    renderApp(<ShowDetailModal showId={SHOW_ID} open onClose={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Breaking Bad" })).toBeInTheDocument();
    expect(screen.getByText("1 of 3 watched")).toBeInTheDocument();

    // Season rows themselves are visible...
    expect(screen.getByText("Season 1")).toBeInTheDocument();
    expect(screen.getByText("Season 2")).toBeInTheDocument();
    // ...but no episode checkboxes until a season is expanded.
    expect(screen.queryByLabelText(/episode 1/i)).not.toBeInTheDocument();
  });

  it("expanding a season reveals its episodes; a second season can be expanded at the same time", async () => {
    mockDetail();
    const user = userEvent.setup();
    renderApp(<ShowDetailModal showId={SHOW_ID} open onClose={vi.fn()} />);
    await screen.findByRole("heading", { name: "Breaking Bad" });

    const season1 = within(screen.getByTestId("season-row-1"));
    const season2 = within(screen.getByTestId("season-row-2"));

    await user.click(season1.getByText("Season 1"));
    expect(season1.getByLabelText("Season 1 episode 1")).toBeInTheDocument();
    expect(season2.queryByLabelText("Season 2 episode 1")).not.toBeInTheDocument();

    await user.click(season2.getByText("Season 2"));
    // Both stay expanded simultaneously.
    expect(season1.getByLabelText("Season 1 episode 1")).toBeInTheDocument();
    expect(season2.getByLabelText("Season 2 episode 1")).toBeInTheDocument();
  });

  it("rotates the season row's chevron to signal expand/collapse", async () => {
    mockDetail();
    const user = userEvent.setup();
    renderApp(<ShowDetailModal showId={SHOW_ID} open onClose={vi.fn()} />);
    await screen.findByRole("heading", { name: "Breaking Bad" });

    const toggle = within(screen.getByTestId("season-row-1")).getByRole("button", { expanded: false });
    const chevron = toggle.querySelector("svg") as SVGElement;
    expect(chevron).not.toHaveClass("rotate-90");

    await user.click(toggle);
    expect(chevron).toHaveClass("rotate-90");
  });

  it("ticking an unwatched episode calls PUT with { watched: true } and checks the box", async () => {
    mockDetail();
    let receivedBody: unknown;
    server.use(
      http.put(`${API_URL}/shows/${SHOW_ID}/episodes/e2`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(showDetail({ season1Episode2Watched: true }));
      }),
    );
    const user = userEvent.setup();
    renderApp(<ShowDetailModal showId={SHOW_ID} open onClose={vi.fn()} />);
    await screen.findByRole("heading", { name: "Breaking Bad" });

    await user.click(screen.getByText("Season 1"));
    const checkbox = screen.getByLabelText("Season 1 episode 2");
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(receivedBody).toEqual({ watched: true });
    await screen.findByText("2 of 3 watched");
    expect(screen.getByLabelText("Season 1 episode 2")).toBeChecked();
  });

  it("reverts the checkbox and shows an alert when an episode toggle fails", async () => {
    mockDetail();
    server.use(http.put(`${API_URL}/shows/${SHOW_ID}/episodes/e2`, () => HttpResponse.error()));
    const user = userEvent.setup();
    renderApp(<ShowDetailModal showId={SHOW_ID} open onClose={vi.fn()} />);
    await screen.findByRole("heading", { name: "Breaking Bad" });

    await user.click(screen.getByText("Season 1"));
    const checkbox = screen.getByLabelText("Season 1 episode 2");

    await user.click(checkbox);

    await screen.findByRole("alert");
    expect(screen.getByLabelText("Season 1 episode 2")).not.toBeChecked();
  });

  it("season-level Mark all watched calls the season PUT and checks every episode in that season", async () => {
    mockDetail();
    let receivedBody: unknown;
    server.use(
      http.put(`${API_URL}/shows/${SHOW_ID}/seasons/1`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(showDetail({ season1Episode2Watched: true }));
      }),
    );
    const user = userEvent.setup();
    renderApp(<ShowDetailModal showId={SHOW_ID} open onClose={vi.fn()} />);
    await screen.findByRole("heading", { name: "Breaking Bad" });

    await user.click(screen.getByText("Season 1"));
    const season1 = within(screen.getByTestId("season-row-1"));
    await user.click(season1.getByRole("button", { name: "Mark all watched" }));

    expect(receivedBody).toEqual({ watched: true });
    await screen.findByText("2 of 3 watched");
    expect(season1.getByLabelText("Season 1 episode 1")).toBeChecked();
    expect(season1.getByLabelText("Season 1 episode 2")).toBeChecked();
  });

  it("show-level Mark all watched fires a PUT per season", async () => {
    mockDetail();
    const seasonsHit: number[] = [];
    server.use(
      http.put(`${API_URL}/shows/${SHOW_ID}/seasons/:seasonNumber`, ({ params }) => {
        seasonsHit.push(Number(params.seasonNumber));
        return HttpResponse.json({ ok: true });
      }),
    );
    const user = userEvent.setup();
    renderApp(<ShowDetailModal showId={SHOW_ID} open onClose={vi.fn()} />);
    await screen.findByRole("heading", { name: "Breaking Bad" });

    const header = within(screen.getByTestId("show-header"));
    await user.click(header.getByRole("button", { name: "Mark all watched" }));

    await screen.findByText("3 of 3 watched");
    expect(seasonsHit.sort()).toEqual([1, 2]);
    // One context-sensitive button, not two — it flips label once full.
    expect(header.getByRole("button", { name: "Unmark all" })).toBeInTheDocument();
    expect(header.queryByRole("button", { name: "Mark all watched" })).not.toBeInTheDocument();
  });

  it("shows a Watch State color dot per season, matching the poster grid's own green/brand/neutral language", async () => {
    mockDetail();
    renderApp(<ShowDetailModal showId={SHOW_ID} open onClose={vi.fn()} />);
    await screen.findByRole("heading", { name: "Breaking Bad" });

    const season1 = within(screen.getByTestId("season-row-1"));
    const season2 = within(screen.getByTestId("season-row-2"));
    expect(season1.getByText("Season 1").previousElementSibling).toHaveClass("bg-brand");
    expect(season2.getByText("Season 2").previousElementSibling).toHaveClass("bg-muted-foreground/40");
  });

  it("closes via the corner close button, positioned outside the header row", async () => {
    mockDetail();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderApp(<ShowDetailModal showId={SHOW_ID} open onClose={onClose} />);
    await screen.findByRole("heading", { name: "Breaking Bad" });

    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(within(screen.getByTestId("show-header")).queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    await user.click(closeButton);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("states the consequence and calls DELETE on confirming", async () => {
    mockDetail();
    let deleteCalled = false;
    server.use(
      http.delete(`${API_URL}/shows/${SHOW_ID}`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderApp(<ShowDetailModal showId={SHOW_ID} open onClose={onClose} />);
    await screen.findByRole("heading", { name: "Breaking Bad" });

    expect(screen.getByText("This removes your watch history for this show.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete show" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(deleteCalled).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape", async () => {
    mockDetail();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderApp(<ShowDetailModal showId={SHOW_ID} open onClose={onClose} />);
    await screen.findByRole("heading", { name: "Breaking Bad" });

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
