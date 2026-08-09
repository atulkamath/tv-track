import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import { server } from "../../../test/server";
import { renderApp, screen, fireEvent, waitFor } from "../../../test/render";
import { PosterGrid, API_URL } from "./PosterGrid";

const mockGetToken = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}));

beforeEach(() => {
  mockGetToken.mockReset();
  mockGetToken.mockResolvedValue("token-123");
});

function mockShows(cards: unknown[]) {
  server.use(http.get(`${API_URL}/shows`, () => HttpResponse.json(cards)));
}

const FULL_SHOW = {
  id: "s1",
  title: "Breaking Bad",
  poster_path: "/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg",
  watch_state: "full",
  watched_count: 4,
  episode_count: 4,
};

const PARTIAL_SHOW = {
  id: "s2",
  title: "The Wire",
  poster_path: "/4lbclFySvugI51fwsyxBTOm4DqK.jpg",
  watch_state: "partial",
  watched_count: 1,
  episode_count: 4,
};

const NOT_STARTED_SHOW = {
  id: "s3",
  title: "The Office",
  poster_path: null,
  watch_state: "none",
  watched_count: 0,
  episode_count: 6,
};

describe("PosterGrid", () => {
  it("shows a loading state while the request is in flight", () => {
    mockShows([]);
    renderApp(<PosterGrid />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("shows shimmer skeleton tiles (not plain text) for the ordinary initial load, distinct from a parse's own pending skeletons", () => {
    mockShows([]);
    renderApp(<PosterGrid />);

    const skeletons = screen.getAllByTestId("poster-skeleton-loading");
    expect(skeletons).toHaveLength(12);
    skeletons.forEach((skeleton) => {
      expect(skeleton).toHaveClass("animate-pulse");
      expect(skeleton).toHaveClass("motion-reduce:animate-none");
    });
    expect(screen.queryByTestId("poster-skeleton")).not.toBeInTheDocument();
  });

  it("shows an inline error if the request fails", async () => {
    server.use(http.get(`${API_URL}/shows`, () => HttpResponse.error()));
    renderApp(<PosterGrid />);
    await screen.findByRole("alert");
  });

  it("renders a Full show with the green check chip and a full-width bar, no text", async () => {
    mockShows([FULL_SHOW]);
    renderApp(<PosterGrid />);

    const tile = await screen.findByTestId("poster-tile");
    expect(tile).toHaveAttribute("data-watch-state", "full");
    expect(screen.getByLabelText("Full")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();

    const bar = tile.querySelector("div > div") as HTMLElement;
    expect(bar).toHaveStyle({ width: "100%" });
  });

  it("uses the brand accent for a Partial show's progress bar, and gives every tile a staggered entrance animation", async () => {
    mockShows([PARTIAL_SHOW, FULL_SHOW]);
    renderApp(<PosterGrid />);

    const tiles = await screen.findAllByTestId("poster-tile");
    expect(tiles).toHaveLength(2);

    const partialBar = tiles[0].querySelector("div > div") as HTMLElement;
    expect(partialBar).toHaveClass("bg-brand");

    tiles.forEach((tile) => {
      expect(tile).toHaveClass("animate-tile-in");
      expect(tile).toHaveClass("motion-reduce:animate-none");
    });
    // Staggered, not identical — the second tile's delay is later than the first's.
    expect(tiles[1].style.animationDelay).not.toBe(tiles[0].style.animationDelay);
  });

  it("renders a Partial show with a percentage label and a partial-width bar, computed straight from GET /shows (#19: no follow-up request)", async () => {
    let detailCalled = false;
    server.use(http.get(`${API_URL}/shows/${PARTIAL_SHOW.id}`, () => ((detailCalled = true), HttpResponse.error())));
    mockShows([PARTIAL_SHOW]);
    renderApp(<PosterGrid />);

    const tile = await screen.findByTestId("poster-tile");
    expect(tile).toHaveAttribute("data-watch-state", "partial");

    const percent = await screen.findByText("25%");
    const bar = tile.querySelector("div > div") as HTMLElement;
    expect(bar).toHaveStyle({ width: "25%" });
    expect(percent).toBeInTheDocument();
    expect(detailCalled).toBe(false);
  });

  it("renders a Not-started show dimmed, restoring on hover", async () => {
    mockShows([NOT_STARTED_SHOW]);
    renderApp(<PosterGrid />);

    const tile = await screen.findByTestId("poster-tile");
    expect(tile).toHaveAttribute("data-watch-state", "none");
    expect(tile).toHaveClass("brightness-[.6]");
    expect(tile).toHaveClass("hover:brightness-100");
  });

  it("renders the empty-state card, not an empty grid, when there are zero shows", async () => {
    mockShows([]);
    renderApp(<PosterGrid />);

    await screen.findByText(/nothing here yet/i);
    expect(screen.queryByRole("list", { name: "Shows" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Log watching" })).toBeInTheDocument();
  });

  it("animates the empty state in and gives its primary CTA the brand accent, motion-reduce-aware", async () => {
    mockShows([]);
    renderApp(<PosterGrid />);

    const heading = await screen.findByText(/nothing here yet/i);
    const card = heading.parentElement as HTMLElement;
    expect(card).toHaveClass("animate-empty-in");
    expect(card).toHaveClass("motion-reduce:animate-none");

    const cta = screen.getByRole("button", { name: "+ Log watching" });
    expect(cta).toHaveClass("bg-brand");
  });

  it("opens the Spotlight palette when + Log watching is clicked", async () => {
    mockShows([]);
    const onOpenPalette = vi.fn();
    renderApp(<PosterGrid onOpenPalette={onOpenPalette} />);

    await screen.findByText(/nothing here yet/i);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "+ Log watching" }));

    expect(onOpenPalette).toHaveBeenCalledOnce();
  });

  it("refetches GET /shows when refreshKey changes, so an add via the Spotlight palette doesn't leave the grid stale", async () => {
    mockShows([]);
    const { rerender } = renderApp(<PosterGrid refreshKey={0} />);
    await screen.findByText(/nothing here yet/i);

    mockShows([FULL_SHOW]);
    rerender(<PosterGrid refreshKey={1} />);

    await screen.findByTestId("poster-tile");
    expect(screen.queryByText(/nothing here yet/i)).not.toBeInTheDocument();
  });

  it("adds a show to the wall when an empty-state example is clicked", async () => {
    mockShows([]);
    let receivedBody: unknown;
    server.use(
      http.post(`${API_URL}/shows`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(FULL_SHOW);
      }),
    );
    renderApp(<PosterGrid />);

    await screen.findByText(/nothing here yet/i);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Breaking Bad" }));

    await screen.findByTestId("poster-tile");
    expect(receivedBody).toEqual({ tmdb_id: 1396 });
    expect(screen.queryByText(/nothing here yet/i)).not.toBeInTheDocument();
  });

  it("falls back to a readable placeholder when poster art is missing", async () => {
    mockShows([NOT_STARTED_SHOW]);
    renderApp(<PosterGrid />);

    await screen.findByTestId("poster-tile");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("TO")).toBeInTheDocument();
  });

  it("falls back to a readable placeholder when poster art fails to load", async () => {
    mockShows([FULL_SHOW]);
    renderApp(<PosterGrid />);

    const img = await screen.findByRole("img");
    fireEvent.error(img);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("BB")).toBeInTheDocument();
  });

  it("opens the show detail modal for that show's id when a poster tile is clicked", async () => {
    mockShows([FULL_SHOW, PARTIAL_SHOW]);
    server.use(
      http.get(`${API_URL}/shows/${PARTIAL_SHOW.id}`, () =>
        HttpResponse.json({
          id: PARTIAL_SHOW.id,
          title: PARTIAL_SHOW.title,
          poster_path: PARTIAL_SHOW.poster_path,
          seasons: [
            {
              season_number: 1,
              watch_state: "partial",
              episodes: [
                { id: "e1", episode_number: 1, runtime_minutes: 45, watched: true },
                { id: "e2", episode_number: 2, runtime_minutes: 45, watched: false },
              ],
            },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp(<PosterGrid />);

    await screen.findAllByTestId("poster-tile");
    await user.click(screen.getByRole("button", { name: `Open ${PARTIAL_SHOW.title}` }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(PARTIAL_SHOW.title);
    expect(dialog).toHaveTextContent("1 of 2 watched");
  });

  it("renders shimmer skeleton placeholders where shows will land while a parse (#12) is pending, on top of the empty-state and alongside real tiles", async () => {
    mockShows([]);
    const { rerender } = renderApp(<PosterGrid refreshKey={0} pendingSkeletonCount={2} />);

    const skeletons = await screen.findAllByTestId("poster-skeleton");
    expect(skeletons).toHaveLength(2);
    expect(screen.queryByText(/nothing here yet/i)).not.toBeInTheDocument();
    skeletons.forEach((skeleton) => {
      expect(skeleton).toHaveClass("animate-pulse");
      expect(skeleton).toHaveClass("motion-reduce:animate-none");
    });

    // A resolved parse bumps refreshKey (Home.tsx's onParseSettled) the same
    // moment it drops pendingSkeletonCount — mirrored here rather than only
    // changing one prop, matching how a real parse settles.
    mockShows([FULL_SHOW]);
    rerender(<PosterGrid refreshKey={1} pendingSkeletonCount={1} />);

    await screen.findByTestId("poster-tile");
    expect(screen.getAllByTestId("poster-skeleton")).toHaveLength(1);
  });

  it("goes back to the empty state once a pending parse clears with nothing resolved", async () => {
    mockShows([]);
    const { rerender } = renderApp(<PosterGrid pendingSkeletonCount={1} />);
    await screen.findByTestId("poster-skeleton");

    rerender(<PosterGrid pendingSkeletonCount={0} />);

    await screen.findByText(/nothing here yet/i);
    expect(screen.queryByTestId("poster-skeleton")).not.toBeInTheDocument();
  });

  it("glow-pops only the show ids passed in glowShowIds, not the rest of the grid", async () => {
    const OTHER_SHOW = { id: "s9", title: "Other Show", poster_path: null, watch_state: "full" };
    mockShows([FULL_SHOW, OTHER_SHOW]);
    renderApp(<PosterGrid glowShowIds={[FULL_SHOW.id]} />);

    await screen.findAllByTestId("poster-tile");
    const bbTile = screen.getByRole("button", { name: `Open ${FULL_SHOW.title}` }).closest("li");
    const otherTile = screen.getByRole("button", { name: `Open ${OTHER_SHOW.title}` }).closest("li");

    expect(bbTile).toHaveClass("animate-glow-pop");
    expect(otherTile).not.toHaveClass("animate-glow-pop");
  });

  it("refetches GET /shows after a modal-driven delete, so the tile disappears without a page reload", async () => {
    mockShows([FULL_SHOW]);
    server.use(
      http.get(`${API_URL}/shows/${FULL_SHOW.id}`, () =>
        HttpResponse.json({
          id: FULL_SHOW.id,
          title: FULL_SHOW.title,
          poster_path: FULL_SHOW.poster_path,
          seasons: [
            {
              season_number: 1,
              watch_state: "full",
              episodes: [{ id: "e1", episode_number: 1, runtime_minutes: 45, watched: true }],
            },
          ],
        }),
      ),
      http.delete(`${API_URL}/shows/${FULL_SHOW.id}`, () => new HttpResponse(null, { status: 204 })),
    );
    const user = userEvent.setup();
    renderApp(<PosterGrid />);

    await user.click(await screen.findByRole("button", { name: `Open ${FULL_SHOW.title}` }));
    await screen.findByRole("dialog");

    // The show is gone once the modal's delete succeeds — mock the refetch
    // it triggers to return an empty list.
    mockShows([]);
    await user.click(screen.getByRole("button", { name: "Delete show" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await screen.findByText(/nothing here yet/i);
    expect(screen.queryByTestId("poster-tile")).not.toBeInTheDocument();
  });

  it("calls onShowsChanged after an empty-state example add and after a modal-driven change, so a caller can refresh Watch Time", async () => {
    mockShows([]);
    server.use(http.post(`${API_URL}/shows`, () => HttpResponse.json(FULL_SHOW)));
    const onShowsChanged = vi.fn();
    const user = userEvent.setup();
    renderApp(<PosterGrid onShowsChanged={onShowsChanged} />);

    await screen.findByText(/nothing here yet/i);
    await user.click(screen.getByRole("button", { name: "Breaking Bad" }));
    await screen.findByTestId("poster-tile");
    expect(onShowsChanged).toHaveBeenCalledOnce();

    server.use(
      http.get(`${API_URL}/shows/${FULL_SHOW.id}`, () =>
        HttpResponse.json({
          id: FULL_SHOW.id,
          title: FULL_SHOW.title,
          poster_path: FULL_SHOW.poster_path,
          seasons: [
            {
              season_number: 1,
              watch_state: "full",
              episodes: [{ id: "e1", episode_number: 1, runtime_minutes: 45, watched: true }],
            },
          ],
        }),
      ),
    );
    await user.click(screen.getByRole("button", { name: `Open ${FULL_SHOW.title}` }));
    await screen.findByText("Season 1");
    await user.click(screen.getByText("Season 1"));
    const checkbox = screen.getByLabelText("Season 1 episode 1");
    server.use(
      http.put(`${API_URL}/shows/${FULL_SHOW.id}/episodes/e1`, () =>
        HttpResponse.json({
          id: FULL_SHOW.id,
          title: FULL_SHOW.title,
          poster_path: FULL_SHOW.poster_path,
          seasons: [
            {
              season_number: 1,
              watch_state: "none",
              episodes: [{ id: "e1", episode_number: 1, runtime_minutes: 45, watched: false }],
            },
          ],
        }),
      ),
    );
    await user.click(checkbox);

    await waitFor(() => expect(onShowsChanged).toHaveBeenCalledTimes(2));
  });
});
