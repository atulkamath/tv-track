"use client";

import type { ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  children?: ReactNode;
}

/**
 * The one modal primitive every centered overlay in this app builds on (show
 * detail, Disambiguation Step, per docs/design.md). Focus trap, Esc,
 * outside-click, and focus restore all come from Base UI's Dialog — see
 * node_modules/@base-ui/react/dialog/root/DialogRoot.d.ts for the exact
 * defaults (modal=true, initialFocus/finalFocus default to "move focus").
 */
export function Modal({ open, onClose, ariaLabel, children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6">
          <Dialog.Popup
            aria-label={ariaLabel}
            className="max-h-[84vh] w-full max-w-[640px] overflow-auto rounded-lg bg-surface shadow-modal outline-none"
          >
            {children}
          </Dialog.Popup>
        </Dialog.Backdrop>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
