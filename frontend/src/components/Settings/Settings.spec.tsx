import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import { server } from "../../../test/server";
import { renderApp, screen, waitFor } from "../../../test/render";
import { Settings, API_URL } from "./Settings";

const mockGetToken = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}));

beforeEach(() => {
  mockGetToken.mockReset();
  mockGetToken.mockResolvedValue("token-123");
});

/** `GET /me`'s actual wire shape — snake_case, per profile.dto.ts. */
interface ProfileResponse {
  id: string;
  friend_code: string;
}

/** One User as seen on someone else's Friend Request — per user-summary.dto.ts. */
interface UserSummaryResponse {
  id: string;
  friend_code: string;
  email: string;
}

interface FriendRequestResponse {
  id: string;
  user: UserSummaryResponse;
  created_at: string;
}

function mockProfile(friendCode: string) {
  const body: ProfileResponse = { id: "u1", friend_code: friendCode };
  server.use(http.get(`${API_URL}/me`, () => HttpResponse.json(body)));
}

function mockRequests(incoming: FriendRequestResponse[], outgoing: FriendRequestResponse[] = []) {
  server.use(http.get(`${API_URL}/friend-requests`, () => HttpResponse.json({ incoming, outgoing })));
}

const PRIYA: FriendRequestResponse = {
  id: "req-1",
  user: { id: "u2", friend_code: "PRIYA2", email: "priya@example.test" },
  created_at: "2026-08-01T00:00:00.000Z",
};

const SAM: FriendRequestResponse = {
  id: "req-2",
  user: { id: "u3", friend_code: "SAMSAM", email: "sam@example.test" },
  created_at: "2026-08-02T00:00:00.000Z",
};

describe("Settings", () => {
  it("shows the Friend Code and copies it via the Copy button, confirming with a toast", async () => {
    mockProfile("AB2CD9");
    mockRequests([]);
    const user = userEvent.setup();
    // user-event installs its own Clipboard stub lazily behind a getter
    // (@testing-library/user-event/dist/cjs/utils/dataTransfer/Clipboard.js)
    // once `setup()` runs — spy on its `writeText` rather than replacing
    // `navigator.clipboard` outright, which that stub would just reinstall.
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    renderApp(<Settings />);

    await screen.findByText("AB2CD9");
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith("AB2CD9");
    expect(await screen.findByText("Friend Code copied")).toBeInTheDocument();
  });

  it("states the consequence before Regenerate acts, then requires a second click to confirm", async () => {
    mockProfile("AB2CD9");
    mockRequests([]);
    let regenerateCalled = false;
    server.use(
      http.post(`${API_URL}/me/friend-code/regenerate`, () => {
        regenerateCalled = true;
        return HttpResponse.json({ id: "u1", friend_code: "ZZ9YY8" });
      }),
    );
    const user = userEvent.setup();
    renderApp(<Settings />);
    await screen.findByText("AB2CD9");

    expect(screen.getByText("The old code stops working.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(regenerateCalled).toBe(false);
    expect(screen.getByRole("button", { name: "Confirm regenerate" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm regenerate" }));

    expect(regenerateCalled).toBe(true);
    expect(await screen.findByText("ZZ9YY8")).toBeInTheDocument();
    expect(screen.queryByText("AB2CD9")).not.toBeInTheDocument();
  });

  it("sends a Friend Request by code or email, adding it to Outgoing", async () => {
    mockProfile("AB2CD9");
    mockRequests([]);
    let receivedBody: unknown;
    server.use(
      http.post(`${API_URL}/friend-requests`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(SAM);
      }),
    );
    const user = userEvent.setup();
    renderApp(<Settings />);
    await screen.findByText("AB2CD9");
    await screen.findByText(/nothing pending/i);

    await user.type(screen.getByRole("textbox", { name: /friend code or email/i }), "sam@example.test");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(receivedBody).toEqual({ email: "sam@example.test" }));
    expect(await screen.findByText("sam@example.test")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("shows an inline error next to Send when the request fails, not a toast", async () => {
    mockProfile("AB2CD9");
    mockRequests([]);
    server.use(http.post(`${API_URL}/friend-requests`, () => HttpResponse.error()));
    const user = userEvent.setup();
    renderApp(<Settings />);
    await screen.findByText("AB2CD9");

    await user.type(screen.getByRole("textbox", { name: /friend code or email/i }), "NOCODE1");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't find a match/i);
    // Not a toast: the error renders inline, not the copy-confirmation note.
    expect(screen.queryByText("Friend Code copied")).not.toBeInTheDocument();
  });

  it("accepting an incoming request removes it from the list and notifies the caller (for the Leaderboard, #15)", async () => {
    mockProfile("AB2CD9");
    mockRequests([PRIYA]);
    server.use(
      http.put(`${API_URL}/friend-requests/${PRIYA.id}/accept`, () =>
        HttpResponse.json({ friend: PRIYA.user }),
      ),
    );
    const onFriendAccepted = vi.fn();
    const user = userEvent.setup();
    renderApp(<Settings onFriendAccepted={onFriendAccepted} />);

    await screen.findByText("priya@example.test");
    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(screen.queryByText("priya@example.test")).not.toBeInTheDocument());
    expect(onFriendAccepted).toHaveBeenCalledOnce();
  });

  it("declining an incoming request removes it from the pending list", async () => {
    mockProfile("AB2CD9");
    mockRequests([PRIYA]);
    server.use(http.put(`${API_URL}/friend-requests/${PRIYA.id}/decline`, () => new HttpResponse(null, { status: 204 })));
    const user = userEvent.setup();
    renderApp(<Settings />);

    await screen.findByText("priya@example.test");
    await user.click(screen.getByRole("button", { name: "Decline" }));

    await waitFor(() => expect(screen.queryByText("priya@example.test")).not.toBeInTheDocument());
  });

  it("shows an inviting empty-state line when there are zero pending requests", async () => {
    mockProfile("AB2CD9");
    mockRequests([], []);
    renderApp(<Settings />);

    expect(await screen.findByText("Nothing pending. Share your code to get started.")).toBeInTheDocument();
  });

  it("lists both incoming and outgoing pending requests", async () => {
    mockProfile("AB2CD9");
    mockRequests([PRIYA], [SAM]);
    renderApp(<Settings />);

    await screen.findByText("priya@example.test");
    expect(screen.getByText("sam@example.test")).toBeInTheDocument();
    expect(screen.getByText("Incoming")).toBeInTheDocument();
    expect(screen.getByText("Outgoing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });
});
