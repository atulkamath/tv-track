import { describe, expect, it } from "vitest";
import { renderApp } from "../../../test/render";
import { Wordmark } from "./Wordmark";

describe("Wordmark", () => {
  it("renders the Tv Track mark", () => {
    const { container } = renderApp(<Wordmark />);
    expect(container.textContent).toBe("Tv Track");
  });

  it("merges a caller-supplied class alongside its own", () => {
    const { container } = renderApp(<Wordmark className="extra" />);
    expect(container.firstElementChild).toHaveClass("extra");
  });
});
