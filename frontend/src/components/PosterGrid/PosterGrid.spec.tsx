import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import { server } from "../../../test/server";
import { renderApp, screen, fireEvent } from "../../../test/render";
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
};

const PARTIAL_SHOW = {
  id: "s2",
  title: "The Wire",
  poster_path: "/4lbclFySvugI51fwsyxBTOm4DqK.jpg",
  watch_state: "partial",
};

const NOT_STARTED_SHOW = {
  id: "s3",
  title: "The Office",
  poster_path: null,
  watch_state: "none",
};

describe("PosterGrid", () => {
  it("shows a loading state while the request is in flight", () => {
    mockShows([]);
    renderApp(<PosterGrid />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
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

  it("renders a Partial show with a percentage label and a partial-width bar, computed from GET /shows/:id", async () => {
    mockShows([PARTIAL_SHOW]);
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
                { id: "e3", episode_number: 3, runtime_minutes: 45, watched: false },
                { id: "e4", episode_number: 4, runtime_minutes: 45, watched: false },
              ],
            },
          ],
        }),
      ),
    );
    renderApp(<PosterGrid />);

    const tile = await screen.findByTestId("poster-tile");
    expect(tile).toHaveAttribute("data-watch-state", "partial");

    const percent = await screen.findByText("25%");
    const bar = tile.querySelector("div > div") as HTMLElement;
    expect(bar).toHaveStyle({ width: "25%" });
    expect(percent).toBeInTheDocument();
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
});
