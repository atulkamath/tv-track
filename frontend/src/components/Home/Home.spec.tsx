import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
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
});
