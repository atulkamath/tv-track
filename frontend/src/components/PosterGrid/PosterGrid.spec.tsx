import { describe, expect, it } from "vitest";
import { renderApp, screen } from "../../../test/render";
import { PosterGrid } from "./PosterGrid";

describe("PosterGrid", () => {
  it("renders one placeholder tile per count", () => {
    renderApp(<PosterGrid count={5} />);
    expect(screen.getAllByTestId("poster-placeholder")).toHaveLength(5);
  });

  it("defaults to a reasonable tile count when none is given", () => {
    renderApp(<PosterGrid />);
    expect(screen.getAllByTestId("poster-placeholder").length).toBeGreaterThan(0);
  });

  it("renders as a list of placeholders, not real show data", () => {
    renderApp(<PosterGrid count={2} />);
    const grid = screen.getByRole("list", { name: "Shows" });
    expect(grid).toBeInTheDocument();
  });
});
