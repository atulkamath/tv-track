import { describe, expect, it } from "vitest";
import { renderApp, screen } from "../../../test/render";
import { PlaceholderGrid } from "./PlaceholderGrid";

describe("PlaceholderGrid", () => {
  it("renders one placeholder tile per count", () => {
    renderApp(<PlaceholderGrid count={5} />);
    expect(screen.getAllByTestId("poster-placeholder")).toHaveLength(5);
  });

  it("defaults to a reasonable tile count when none is given", () => {
    renderApp(<PlaceholderGrid />);
    expect(screen.getAllByTestId("poster-placeholder").length).toBeGreaterThan(0);
  });

  it("renders as a list of placeholders, not real show data", () => {
    renderApp(<PlaceholderGrid count={2} />);
    const grid = screen.getByRole("list", { name: "Shows" });
    expect(grid).toBeInTheDocument();
  });
});
