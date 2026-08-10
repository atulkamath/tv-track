import { describe, expect, it } from "vitest";
import { renderApp, screen } from "../../../test/render";
import { Hero } from "./Hero";

describe("Hero", () => {
  it("renders the wordmark and tagline", () => {
    const { container } = renderApp(<Hero />);
    expect(container.textContent).toContain("Tv Track");
    expect(screen.getByText("Log what you watch. Outwatch your friends.")).toBeInTheDocument();
  });

  it("links Sign in to /sign-in and Sign up to /sign-up", () => {
    renderApp(<Hero />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
  });

  it("previews a minimal inline Leaderboard with the viewer winning, not a generic mock-up", () => {
    const { container } = renderApp(<Hero />);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Moss")).toBeInTheDocument();
    // The preview is aria-hidden (decorative) — query the DOM directly. "You" is chip 1 with the highest Watch Time: the hook is winning, not just participating.
    const chips = container.querySelectorAll("ol li");
    expect(chips).toHaveLength(4);
    expect(chips[0]).toHaveTextContent("You");
    expect(chips[0]).toHaveTextContent("3d 6h");
  });

  it("also previews the poster wall, full width with real TMDB art", () => {
    renderApp(<Hero />);
    const image = screen.getByAltText("Breaking Bad");
    expect(image).toHaveAttribute("src", "https://image.tmdb.org/t/p/w342/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg");
  });

  it("makes Sign up the one loud brand CTA, keeping Sign in a quiet secondary action", () => {
    renderApp(<Hero />);
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveClass("bg-brand");
    expect(screen.getByRole("link", { name: "Sign in" })).not.toHaveClass("bg-brand");
  });

  it("animates the wordmark, tagline, actions, and app preview in, staggered and motion-reduce-aware", () => {
    const { container } = renderApp(<Hero />);
    const animated = Array.from(container.querySelectorAll<HTMLElement>(".animate-empty-in"));

    expect(animated).toHaveLength(4);
    const delays = animated.map((el) => {
      expect(el).toHaveClass("motion-reduce:animate-none");
      return el.style.animationDelay;
    });
    // Distinct delays — a real stagger, not four elements firing at once.
    expect(new Set(delays).size).toBe(delays.length);
  });
});
