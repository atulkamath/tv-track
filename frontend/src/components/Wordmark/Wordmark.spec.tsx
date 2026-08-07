import { describe, expect, it } from "vitest";
import { renderApp } from "../../../test/render";
import { Wordmark } from "./Wordmark";

describe("Wordmark", () => {
  it("renders the tv·track mark", () => {
    const { container } = renderApp(<Wordmark />);
    expect(container.textContent).toBe("tv·track");
  });

  it("merges a caller-supplied class alongside its own", () => {
    const { container } = renderApp(<Wordmark className="extra" />);
    expect(container.firstElementChild).toHaveClass("extra");
  });
});
