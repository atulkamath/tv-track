import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import { server } from "../../../test/server";
import { renderApp, screen, waitFor } from "../../../test/render";
import { SpotlightPalette, API_URL } from "./SpotlightPalette";

const mockGetToken = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}));

beforeEach(() => {
  mockGetToken.mockReset();
  mockGetToken.mockResolvedValue("token-123");
});

/** The backend's actual wire shape — snake_case, per search-shows.dto.ts. */
interface SearchResultResponse {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  episode_count: number;
}

const BREAKING_BAD: SearchResultResponse = {
  tmdb_id: 1396,
  title: "Breaking Bad",
  year: 2008,
  poster_path: "/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg",
  episode_count: 62,
};

const OFFICE_US: SearchResultResponse = {
  tmdb_id: 2316,
  title: "The Office",
  year: 2005,
  poster_path: "/7DJKHzAi83BmQrWLrYYOqcoKfhR.jpg",
  episode_count: 201,
};

const OFFICE_UK: SearchResultResponse = {
  tmdb_id: 2996,
  title: "The Office",
  year: 2001,
  poster_path: "/74Br1nZ3rGP4TCyt2s9zoR7YuxU.jpg",
  episode_count: 14,
};

function mockSearch(results: SearchResultResponse[]) {
  server.use(http.get(`${API_URL}/shows/search`, () => HttpResponse.json(results)));
}

function mockAdd() {
  server.use(
    http.post(`${API_URL}/shows`, () =>
      HttpResponse.json({ id: "s1", title: "x", poster_path: null, watch_state: "full" }),
    ),
  );
}

describe("SpotlightPalette", () => {
  it("debounces typing and calls GET /shows/search with the typed value, rendering title/year/art", async () => {
    let receivedQuery: string | null = null;
    server.use(
      http.get(`${API_URL}/shows/search`, ({ request }) => {
        receivedQuery = new URL(request.url).searchParams.get("q");
        return HttpResponse.json([BREAKING_BAD]);
      }),
    );
    const user = userEvent.setup();
    renderApp(<SpotlightPalette open onClose={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: /search for a show/i });
    await user.type(input, "breaking bad");

    await waitFor(() => expect(receivedQuery).toBe("breaking bad"));
    expect(await screen.findByText("Breaking Bad")).toBeInTheDocument();
    expect(screen.getByText("2008")).toBeInTheDocument();
    const img = screen.getByAltText("Breaking Bad");
    expect(img).toHaveAttribute("src", expect.stringContaining("/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg"));
  });

  it("renders an ambiguous title (the office) as distinct rows, keyed by tmdb_id", async () => {
    mockSearch([OFFICE_US, OFFICE_UK]);
    const user = userEvent.setup();
    renderApp(<SpotlightPalette open onClose={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: /search for a show/i }), "the office");

    const rows = await screen.findAllByRole("option");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("2005")).toBeInTheDocument();
    expect(screen.getByText("2001")).toBeInTheDocument();
  });

  it("clicking Add calls POST /shows with that row's tmdb_id (no seasons field), shows a chip, and keeps the palette open", async () => {
    mockSearch([BREAKING_BAD]);
    let receivedBody: unknown;
    server.use(
      http.post(`${API_URL}/shows`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ id: "s1", title: "Breaking Bad", poster_path: null, watch_state: "full" });
      }),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderApp(<SpotlightPalette open onClose={onClose} />);

    await user.type(screen.getByRole("textbox", { name: /search for a show/i }), "breaking bad");
    await screen.findByText("Breaking Bad");

    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("✓ added")).toBeInTheDocument();
    expect(receivedBody).toEqual({ tmdb_id: 1396 });
    expect(onClose).not.toHaveBeenCalled();
    // The dialog itself should still be present.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes the palette on Escape", async () => {
    mockSearch([]);
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderApp(<SpotlightPalette open onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves the highlighted row with ArrowDown/ArrowUp and adds the highlighted one on Enter", async () => {
    mockSearch([OFFICE_US, OFFICE_UK]);
    let receivedBody: unknown;
    server.use(
      http.post(`${API_URL}/shows`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ id: "s1", title: "The Office", poster_path: null, watch_state: "full" });
      }),
    );
    const user = userEvent.setup();
    renderApp(<SpotlightPalette open onClose={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: /search for a show/i });
    await user.type(input, "the office");
    const rows = await screen.findAllByRole("option");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("aria-selected", "true");

    await user.type(input, "{ArrowDown}");
    expect(rows[1]).toHaveAttribute("aria-selected", "true");
    expect(rows[0]).toHaveAttribute("aria-selected", "false");

    await user.type(input, "{ArrowUp}");
    expect(rows[0]).toHaveAttribute("aria-selected", "true");

    await user.type(input, "{ArrowDown}{Enter}");
    await waitFor(() => expect(receivedBody).toEqual({ tmdb_id: OFFICE_UK.tmdb_id }));
  });

  it("shows the 3 example rows when empty, hiding them while typing", async () => {
    mockSearch([BREAKING_BAD]);
    const user = userEvent.setup();
    renderApp(<SpotlightPalette open onClose={vi.fn()} />);

    expect(screen.getByText(/try one of these/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Breaking Bad" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "The Office" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "The Wire" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: /search for a show/i }), "b");
    expect(screen.queryByText(/try one of these/i)).not.toBeInTheDocument();
  });

  it("marks a show already added this session as added in its suggestion row", async () => {
    mockSearch([BREAKING_BAD]);
    mockAdd();
    const user = userEvent.setup();
    renderApp(<SpotlightPalette open onClose={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: /search for a show/i });
    await user.type(input, "breaking bad");
    await screen.findByText("Breaking Bad");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText("✓ added");

    // Clear the query and search again — the same tmdb_id should still read as added.
    await user.clear(input);
    await user.type(input, "breaking bad");

    expect(await screen.findByText("✓ added")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
  });

  it("shows an inline error when the search fails", async () => {
    server.use(http.get(`${API_URL}/shows/search`, () => HttpResponse.error()));
    const user = userEvent.setup();
    renderApp(<SpotlightPalette open onClose={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: /search for a show/i }), "breaking bad");
    await screen.findByRole("alert");
  });

  it("shows an inline error when the add fails", async () => {
    mockSearch([BREAKING_BAD]);
    server.use(http.post(`${API_URL}/shows`, () => HttpResponse.error()));
    const user = userEvent.setup();
    renderApp(<SpotlightPalette open onClose={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: /search for a show/i }), "breaking bad");
    await screen.findByText("Breaking Bad");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await screen.findByRole("alert");
  });
});
