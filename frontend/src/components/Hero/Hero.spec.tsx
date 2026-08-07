import { describe, expect, it } from "vitest";
import { renderApp, screen } from "../../../test/render";
import { Hero } from "./Hero";

describe("Hero", () => {
  it("renders the wordmark and tagline", () => {
    const { container } = renderApp(<Hero />);
    expect(container.textContent).toContain("tv·track");
    expect(screen.getByText("Log what you watch. Outwatch your friends.")).toBeInTheDocument();
  });

  it("links Sign in to /sign-in and Sign up to /sign-up", () => {
    renderApp(<Hero />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
  });

  it("renders a mock poster grid beneath the actions", () => {
    renderApp(<Hero />);
    expect(screen.getAllByTestId("poster-placeholder").length).toBeGreaterThan(0);
  });
});
