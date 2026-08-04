import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";

/**
 * The frontend's rendered-UI test seam: mounts a component the way it will
 * actually run in the browser. Currently a thin wrapper — no providers exist
 * yet — but every later ticket that adds one (auth, data-fetching) wraps it
 * here once, so tests keep calling `renderApp` rather than hand-rolling
 * provider trees per test file.
 */
export function renderApp(ui: ReactElement, options?: RenderOptions) {
  return render(ui, options);
}

export * from "@testing-library/react";
