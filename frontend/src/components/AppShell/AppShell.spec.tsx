import { describe, expect, it, vi } from "vitest";
import { renderApp, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders the Home/Leaderboard/Settings nav placeholders", () => {
    renderApp(
      <AppShell active="home">
        <p>content</p>
      </AppShell>,
    );
    for (const label of ["Home", "Leaderboard", "Settings"]) {
      // Rendered twice: once for the desktop sidebar, once for the mobile
      // top-tab strip — CSS toggles which one is visible per breakpoint.
      expect(screen.getAllByText(label)).toHaveLength(2);
    }
  });

  it("marks the active nav item with aria-current in both nav renderings", () => {
    renderApp(
      <AppShell active="leaderboard">
        <p>content</p>
      </AppShell>,
    );
    const active = screen.getAllByRole("button", { name: "Leaderboard" });
    expect(active).toHaveLength(2);
    active.forEach((btn) => expect(btn).toHaveAttribute("aria-current", "page"));

    const inactive = screen.getAllByRole("button", { name: "Home" });
    inactive.forEach((btn) => expect(btn).not.toHaveAttribute("aria-current"));
  });

  it("calls onNavigate with the clicked item's key", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderApp(
      <AppShell active="home" onNavigate={onNavigate}>
        <p>content</p>
      </AppShell>,
    );
    await user.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("renders children inside the main content area", () => {
    renderApp(
      <AppShell active="home">
        <p>unique child content</p>
      </AppShell>,
    );
    expect(screen.getByText("unique child content")).toBeInTheDocument();
  });

  it("renders sidebarExtra and topStripExtra in their own slots, once each", () => {
    renderApp(
      <AppShell
        active="home"
        sidebarExtra={<p>sidebar stat</p>}
        topStripExtra={<p>strip stat</p>}
      >
        <p>content</p>
      </AppShell>,
    );
    expect(screen.getAllByText("sidebar stat")).toHaveLength(1);
    expect(screen.getAllByText("strip stat")).toHaveLength(1);
  });

  it("renders neither slot when not passed, unlike Home/Leaderboard/Settings which always render twice", () => {
    renderApp(
      <AppShell active="home">
        <p>content</p>
      </AppShell>,
    );
    expect(screen.queryByText("sidebar stat")).not.toBeInTheDocument();
    expect(screen.queryByText("strip stat")).not.toBeInTheDocument();
  });
});
