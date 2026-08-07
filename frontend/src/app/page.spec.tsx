import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen } from "../../test/render";
import Page from "./page";

const clerkState = vi.hoisted(() => ({ signedIn: false }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@clerk/nextjs", () => ({
  Show: ({
    when,
    fallback,
    children,
  }: {
    when: string;
    fallback?: React.ReactNode;
    children: React.ReactNode;
  }) => (when === "signed-in" && clerkState.signedIn ? children : (fallback ?? null)),
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue(null) }),
}));

beforeEach(() => {
  clerkState.signedIn = false;
});

describe("Page (/)", () => {
  it("shows the hero, not the app shell, when signed out", () => {
    clerkState.signedIn = false;
    renderApp(<Page />);
    expect(screen.getByText("Log what you watch. Outwatch your friends.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
  });

  it("shows Home, not the hero, when signed in", () => {
    clerkState.signedIn = true;
    renderApp(<Page />);
    expect(
      screen.queryByText("Log what you watch. Outwatch your friends."),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Primary" }).length).toBeGreaterThan(0);
  });
});
