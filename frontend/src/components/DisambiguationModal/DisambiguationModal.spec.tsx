import { describe, expect, it, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import { server } from "../../../test/server";
import { renderApp, screen, waitFor } from "../../../test/render";
import { DisambiguationModal, API_URL, type AmbiguousMentionWire } from "./DisambiguationModal";

const mockGetToken = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}));

beforeEach(() => {
  mockGetToken.mockReset();
  mockGetToken.mockResolvedValue("token-123");
});

const OFFICE_US = { tmdb_id: 2316, title: "The Office", year: 2005, poster_path: "/us.jpg", episode_count: 186 };
const OFFICE_UK = { tmdb_id: 2996, title: "The Office", year: 2001, poster_path: "/uk.jpg", episode_count: 12 };

const OFFICE_MENTION: AmbiguousMentionWire = {
  title: "Office",
  seasons: [1, 2],
  candidates: [OFFICE_US, OFFICE_UK],
};

const DARK_MENTION: AmbiguousMentionWire = {
  title: "Dark",
  seasons: null,
  candidates: [{ tmdb_id: 42, title: "Dark", year: 2017, poster_path: null, episode_count: 26 }],
};

function mockAdd() {
  return http.post(`${API_URL}/shows`, () =>
    HttpResponse.json({ id: "s1", title: "x", poster_path: null, watch_state: "full" }),
  );
}

describe("DisambiguationModal", () => {
  it("renders the current mention's title and its candidates as poster cards with year", async () => {
    renderApp(<DisambiguationModal mentions={[OFFICE_MENTION]} onDone={vi.fn()} onShowAdded={vi.fn()} />);

    expect(screen.getByText('"Office"')).toBeInTheDocument();
    expect(screen.getAllByText("The Office")).toHaveLength(2);
    expect(screen.getByText("2005")).toBeInTheDocument();
    expect(screen.getByText("2001")).toBeInTheDocument();
  });

  it("has no progress dots for a single queued mention", () => {
    renderApp(<DisambiguationModal mentions={[OFFICE_MENTION]} onDone={vi.fn()} onShowAdded={vi.fn()} />);

    expect(screen.queryByLabelText(/mention \d of \d/i)).not.toBeInTheDocument();
  });

  it("shows progress dots reflecting position when several mentions are queued", async () => {
    server.use(mockAdd());
    const user = userEvent.setup();
    renderApp(<DisambiguationModal mentions={[OFFICE_MENTION, DARK_MENTION]} onDone={vi.fn()} onShowAdded={vi.fn()} />);

    expect(screen.getByLabelText("Mention 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Skip — don't add this one" }));

    await waitFor(() => expect(screen.getByText('"Dark"')).toBeInTheDocument());
    expect(screen.getByLabelText("Mention 2 of 2")).toBeInTheDocument();
  });

  it("picking a candidate calls POST /shows with its tmdb_id and the mention's seasons, then advances", async () => {
    let receivedBody: unknown;
    server.use(
      http.post(`${API_URL}/shows`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ id: "s1", title: "The Office", poster_path: null, watch_state: "full" });
      }),
    );
    const onShowAdded = vi.fn();
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderApp(
      <DisambiguationModal mentions={[OFFICE_MENTION, DARK_MENTION]} onDone={onDone} onShowAdded={onShowAdded} />,
    );

    await user.click(screen.getByRole("button", { name: /2005/ }));

    await waitFor(() => expect(receivedBody).toEqual({ tmdb_id: 2316, seasons: [1, 2] }));
    expect(onShowAdded).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByText('"Dark"')).toBeInTheDocument());
    expect(onDone).not.toHaveBeenCalled();
  });

  it("omits the seasons key entirely for a whole-show mention rather than sending seasons: null", async () => {
    let receivedBody: unknown;
    server.use(
      http.post(`${API_URL}/shows`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ id: "s1", title: "Dark", poster_path: null, watch_state: "full" });
      }),
    );
    const user = userEvent.setup();
    renderApp(<DisambiguationModal mentions={[DARK_MENTION]} onDone={vi.fn()} onShowAdded={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /2017/ }));

    await waitFor(() => expect(receivedBody).toEqual({ tmdb_id: 42 }));
  });

  it("skip adds nothing and advances the queue", async () => {
    let addCalled = false;
    server.use(
      http.post(`${API_URL}/shows`, () => {
        addCalled = true;
        return HttpResponse.json({ id: "s1", title: "x", poster_path: null, watch_state: "full" });
      }),
    );
    const user = userEvent.setup();
    renderApp(<DisambiguationModal mentions={[OFFICE_MENTION, DARK_MENTION]} onDone={vi.fn()} onShowAdded={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Skip — don't add this one" }));

    await waitFor(() => expect(screen.getByText('"Dark"')).toBeInTheDocument());
    expect(addCalled).toBe(false);
  });

  it("calls onDone after the last mention is skipped", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderApp(<DisambiguationModal mentions={[DARK_MENTION]} onDone={onDone} onShowAdded={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Skip — don't add this one" }));

    expect(onDone).toHaveBeenCalledOnce();
  });

  it("calls onDone after the last mention is picked successfully", async () => {
    server.use(mockAdd());
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderApp(<DisambiguationModal mentions={[DARK_MENTION]} onDone={onDone} onShowAdded={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /2017/ }));

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  });

  it("shows an inline error and stays on the same mention when the pick fails, letting the user retry or skip", async () => {
    server.use(http.post(`${API_URL}/shows`, () => HttpResponse.error()));
    const onDone = vi.fn();
    const user = userEvent.setup();
    renderApp(<DisambiguationModal mentions={[DARK_MENTION]} onDone={onDone} onShowAdded={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /2017/ }));

    await screen.findByRole("alert");
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText('"Dark"')).toBeInTheDocument();
  });
});
