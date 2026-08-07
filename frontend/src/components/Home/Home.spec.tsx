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
});

describe("Home", () => {
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
