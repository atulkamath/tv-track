import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import { renderApp, screen, waitFor } from "../../../test/render";
import { server } from "../../../test/server";
import { Home, API_URL } from "./Home";

const mockReplace = vi.fn();
const mockGetToken = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}));

beforeEach(() => {
  mockReplace.mockReset();
  mockGetToken.mockReset();
  // PosterGrid (rendered for the "home" tab) makes its own `GET /shows` call
  // whenever Clerk hands back a token — give every test in this file a
  // default so tests concerned with the `/me` call don't also have to stub
  // `/shows` just to avoid an unhandled-request error.
  server.use(http.get(`${API_URL}/shows`, () => HttpResponse.json([])));
  // Home's `useWatchTime` fetches `GET /leaderboard` to fill the sidebar and
  // top-strip slots — same reason.
  server.use(http.get(`${API_URL}/leaderboard`, () => HttpResponse.json([])));
});

describe("Home", () => {
  it("fetches the Leaderboard once, not once per Watch Time display", async () => {
    mockGetToken.mockResolvedValue("token-123");
    let calls = 0;
    server.use(
      http.get(`${API_URL}/me`, () => HttpResponse.json({ id: "u1", friend_code: "ABC123" })),
      http.get(`${API_URL}/leaderboard`, () => {
        calls += 1;
        return HttpResponse.json([{ id: "u1", watch_time_minutes: 260, is_self: true }]);
      }),
    );

    renderApp(<Home />);

    // Both the sidebar and the mobile top strip show this number; one hidden
    // by CSS is still mounted, so self-fetching displays would double this.
    await waitFor(() => expect(screen.getAllByText("4h 20m")).toHaveLength(2));
    expect(calls).toBe(1);
  });

  it("renders the app shell, on Home, with the poster grid", () => {
    mockGetToken.mockResolvedValue(null);
    renderApp(<Home />);
    const homeButtons = screen.getAllByRole("button", { name: "Home" });
    homeButtons.forEach((btn) => expect(btn).toHaveAttribute("aria-current", "page"));
    expect(screen.getByRole("status")).toHaveTextContent(/loading your shows/i);
  });

  it("makes an authenticated call to the backend — the first call that lazily creates the user (#2)", async () => {
    mockGetToken.mockResolvedValue("token-123");
    let receivedAuth: string | null = null;
    server.use(
      http.get(`${API_URL}/me`, ({ request }) => {
        receivedAuth = request.headers.get("authorization");
        return HttpResponse.json({ id: "u1", friend_code: "ABC123" });
      }),
    );

    renderApp(<Home />);

    await waitFor(() => expect(receivedAuth).toBe("Bearer token-123"));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("redirects to sign-in when the backend rejects an expired session", async () => {
    mockGetToken.mockResolvedValue("stale-token");
    server.use(http.get(`${API_URL}/me`, () => new HttpResponse(null, { status: 401 })));

    renderApp(<Home />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/sign-in"));
  });

  it("does not call the backend at all before Clerk has produced a token", () => {
    mockGetToken.mockResolvedValue(null);
    server.use(
      http.get(`${API_URL}/me`, () => {
        throw new Error("should not be called without a token");
      }),
    );
    expect(() => renderApp(<Home />)).not.toThrow();
  });

  it("opens the Spotlight palette from the persistent FAB", async () => {
    // No `/me` handler mocked here — opening the palette makes no network
    // call by itself (search only fires once a query is typed) — so give
    // `getToken` a null token, same as the tests above that don't care
    // about the `/me` call, to avoid an unhandled-request error.
    mockGetToken.mockResolvedValue(null);
    const user = userEvent.setup();
    renderApp(<Home />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Log watching" }));

    expect(await screen.findByRole("dialog", { name: "Spotlight palette" })).toBeInTheDocument();
  });

  it("opens the Spotlight palette from the poster grid's + Log watching empty-state button too", async () => {
    // Needs a real token so PosterGrid's own `GET /shows` actually resolves
    // to the empty state (a null token leaves it stuck loading) — mock
    // `/me` too so that call doesn't go unhandled.
    mockGetToken.mockResolvedValue("token-123");
    server.use(http.get(`${API_URL}/me`, () => HttpResponse.json({ id: "u1", friend_code: "ABC123" })));
    const user = userEvent.setup();
    renderApp(<Home />);

    await screen.findByText(/nothing here yet/i);
    await user.click(screen.getByRole("button", { name: "+ Log watching" }));

    expect(await screen.findByRole("dialog", { name: "Spotlight palette" })).toBeInTheDocument();
  });
});

const RESOLVED_SHOW = { id: "s1", title: "Breaking Bad", poster_path: null, watch_state: "full" };
const EXISTING_SHOW = { id: "s0", title: "Existing Show", poster_path: null, watch_state: "full" };

async function openPaletteAndType(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByRole("button", { name: "Log watching" }));
  const input = await screen.findByRole("textbox", { name: /search for a show/i });
  await user.type(input, text);
  return input;
}

describe("Home — parse choreography (#12): pending-parse state lifted from the palette onto PosterGrid", () => {
  beforeEach(() => {
    mockGetToken.mockResolvedValue("token-123");
    server.use(http.get(`${API_URL}/me`, () => HttpResponse.json({ id: "u1", friend_code: "ABC123" })));
  });

  it("renders skeleton cards on the poster wall itself while a parse is pending, then real tiles once it resolves — with a glow-pop on only the newly-landed one", async () => {
    server.use(http.get(`${API_URL}/shows`, () => HttpResponse.json([EXISTING_SHOW])));
    let resolveParse!: (response: Response) => void;
    server.use(
      http.post(
        `${API_URL}/shows/parse`,
        () =>
          new Promise<Response>((resolve) => {
            resolveParse = resolve;
          }),
      ),
    );
    const user = userEvent.setup();
    renderApp(<Home />);
    await screen.findByTestId("poster-tile");

    await openPaletteAndType(user, "breaking bad 3 seasons{Enter}");

    // The skeleton lands on the grid behind the still-open palette, in the
    // position the resolved show is about to occupy — not just inside the
    // modal. (The palette stays open here — same as a single-title add — so
    // the rest of the page is legitimately `aria-hidden`/inert per the
    // Dialog primitive while it's up; that's why the assertions below query
    // by test id/text rather than role.)
    expect(await screen.findByTestId("poster-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("poster-tile")).toBeInTheDocument();

    server.use(http.get(`${API_URL}/shows`, () => HttpResponse.json([EXISTING_SHOW, RESOLVED_SHOW])));
    resolveParse(HttpResponse.json({ resolved: [RESOLVED_SHOW], ambiguous: [], unmatched: [] }));

    await waitFor(() => expect(screen.queryByTestId("poster-skeleton")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByTestId("poster-tile")).toHaveLength(2));

    const tiles = screen.getAllByTestId("poster-tile");
    const newTile = tiles.find((tile) => tile.textContent?.includes(RESOLVED_SHOW.title));
    const existingTile = tiles.find((tile) => tile.textContent?.includes(EXISTING_SHOW.title));
    expect(newTile).toHaveClass("animate-glow-pop");
    expect(existingTile).not.toHaveClass("animate-glow-pop");

    // "then settle" (docs/design.md) — the glow is transient, not permanent.
    await waitFor(() => expect(newTile).not.toHaveClass("animate-glow-pop"), { timeout: 3000 });
  });

  it("clears the skeleton without landing anything when a parse resolves nothing (e.g. fully unmatched)", async () => {
    server.use(http.get(`${API_URL}/shows`, () => HttpResponse.json([])));
    server.use(
      http.post(`${API_URL}/shows/parse`, () =>
        HttpResponse.json({ resolved: [], ambiguous: [], unmatched: [{ title: "xzyabc", reason: "no_tmdb_match" }] }),
      ),
    );
    const user = userEvent.setup();
    renderApp(<Home />);
    await screen.findByText(/nothing here yet/i);

    await openPaletteAndType(user, "xzyabc 2 seasons{Enter}");

    await screen.findByRole("alert");
    await waitFor(() => expect(screen.queryByTestId("poster-skeleton")).not.toBeInTheDocument());
    expect(screen.queryByTestId("poster-tile")).not.toBeInTheDocument();
  });
});

describe("Home — sidebar Watch Time (#1: \"the sidebar shows your Watch Time and rank at all times\")", () => {
  beforeEach(() => {
    mockGetToken.mockResolvedValue("token-123");
    server.use(http.get(`${API_URL}/me`, () => HttpResponse.json({ id: "u1", friend_code: "ABC123" })));
  });

  it("shows the caller's Watch Time and rank, and updates them after a resolved parse — the same trigger that refreshes the poster wall", async () => {
    server.use(http.get(`${API_URL}/shows`, () => HttpResponse.json([])));
    server.use(http.get(`${API_URL}/leaderboard`, () => HttpResponse.json([{ id: "u1", watch_time_minutes: 60, is_self: true }])));
    const user = userEvent.setup();
    renderApp(<Home />);

    // Rendered twice — the desktop sidebar and the mobile top strip both
    // show it at all times (#1's Solution section), same as AppShell's own
    // nav labels; only the sidebar variant also spells out "Rank #N".
    await waitFor(() => expect(screen.getAllByText("1h 0m")).toHaveLength(2));
    expect(screen.getByText("Rank #1")).toBeInTheDocument();

    server.use(http.get(`${API_URL}/shows`, () => HttpResponse.json([RESOLVED_SHOW])));
    server.use(http.get(`${API_URL}/leaderboard`, () => HttpResponse.json([{ id: "u1", watch_time_minutes: 260, is_self: true }])));
    server.use(
      http.post(`${API_URL}/shows/parse`, () =>
        HttpResponse.json({ resolved: [RESOLVED_SHOW], ambiguous: [], unmatched: [] }),
      ),
    );
    await openPaletteAndType(user, "breaking bad 3 seasons{Enter}");

    await waitFor(() => expect(screen.getAllByText("4h 20m")).toHaveLength(2));
  });
});
