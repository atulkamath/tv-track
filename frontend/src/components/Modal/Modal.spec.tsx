import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderApp, screen, waitFor } from "../../../test/render";
import { Modal } from "./Modal";

function Harness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open modal</button>
      <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Test modal">
        <button>First</button>
        <button>Last</button>
      </Modal>
    </div>
  );
}

describe("Modal", () => {
  it("renders nothing when closed", () => {
    renderApp(<Modal open={false} onClose={vi.fn()} ariaLabel="Test modal" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders a dialog with children when open", () => {
    renderApp(
      <Modal open onClose={vi.fn()} ariaLabel="Test modal">
        <p>modal content</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Test modal" })).toBeInTheDocument();
    expect(screen.getByText("modal content")).toBeInTheDocument();
  });

  it("calls onClose on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderApp(
      <Modal open onClose={onClose} ariaLabel="Test modal">
        <p>content</p>
      </Modal>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on outside click but not on inside click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderApp(
      <Modal open onClose={onClose} ariaLabel="Test modal">
        <p>content</p>
      </Modal>,
    );
    await user.click(screen.getByText("content"));
    expect(onClose).not.toHaveBeenCalled();

    // Base UI's backdrop is a sibling of the dialog, not an ancestor — click
    // document.body, which is unambiguously outside the dialog either way.
    await user.click(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves focus into the modal on open, and back to the trigger on close", async () => {
    const user = userEvent.setup();
    renderApp(<Harness />);
    await user.click(screen.getByText("Open modal"));

    // Base UI schedules initial focus via requestAnimationFrame, so it lands
    // a tick after the click that opens the dialog.
    const first = screen.getByText("First");
    await waitFor(() => expect(first).toHaveFocus());

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByText("Open modal")).toHaveFocus());
  });

  it("traps focus: Tab wraps last -> first, Shift+Tab wraps first -> last", async () => {
    const user = userEvent.setup();
    renderApp(<Harness initialOpen />);

    const first = screen.getByText("First");
    const last = screen.getByText("Last");
    await waitFor(() => expect(first).toHaveFocus());

    // Base UI's trap uses real focus-guard sentinel elements at each end of
    // the popup; the guard briefly holds focus before JS redirects it to the
    // wrap target, so these also need waitFor.
    await user.tab({ shift: true });
    await waitFor(() => expect(last).toHaveFocus());

    await user.tab();
    await waitFor(() => expect(first).toHaveFocus());
  });
});
