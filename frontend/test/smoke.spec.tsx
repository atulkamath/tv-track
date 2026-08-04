import { describe, expect, it } from "vitest";
import { renderApp, screen } from "./render";

describe("test harness", () => {
  it("renders a component and exposes jest-dom matchers", () => {
    renderApp(<div>hello tv-track</div>);
    expect(screen.getByText("hello tv-track")).toBeInTheDocument();
  });
});
