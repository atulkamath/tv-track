"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  children?: ReactNode;
}

/**
 * The one modal primitive every centered overlay in this app builds on (show
 * detail, Disambiguation Step, per docs/design.md). Composes the shadcn
 * Dialog rather than Base UI's primitives directly — focus trap, Esc,
 * outside-click, and focus restore all come from it for free (see
 * node_modules/@base-ui/react/dialog/root/DialogRoot.d.ts for the exact
 * defaults). No header/footer here: each specific modal draws its own.
 */
export function Modal({ open, onClose, ariaLabel, children }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-label={ariaLabel}>{children}</DialogContent>
    </Dialog>
  );
}
