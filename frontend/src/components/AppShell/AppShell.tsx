"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/Wordmark/Wordmark";

export type NavKey = "home" | "leaderboard" | "settings";

const NAV_ITEMS: { key: NavKey; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "settings", label: "Settings" },
];

interface NavListProps {
  active: NavKey;
  onNavigate?: (key: NavKey) => void;
  variant: "sidebar" | "topStrip";
}

interface IndicatorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Measured off the real DOM rather than assumed equal-width tabs (topStrip labels differ in length) — lets the active pill slide to its new spot instead of popping. */
function NavList({ active, onNavigate, variant }: NavListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef(new Map<NavKey, HTMLLIElement>());
  const [rect, setRect] = useState<IndicatorRect | null>(null);

  useLayoutEffect(() => {
    function measure() {
      const list = listRef.current;
      const activeItem = itemRefs.current.get(active);
      if (!list || !activeItem) return;
      const listBox = list.getBoundingClientRect();
      const itemBox = activeItem.getBoundingClientRect();
      setRect({
        top: itemBox.top - listBox.top,
        left: itemBox.left - listBox.left,
        width: itemBox.width,
        height: itemBox.height,
      });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);

  return (
    <ul
      ref={listRef}
      className={cn(
        "relative flex list-none",
        variant === "sidebar" ? "flex-col gap-1" : "flex-row gap-2",
      )}
    >
      {rect && (
        <div
          aria-hidden="true"
          className="absolute rounded-md bg-secondary shadow-inner transition-[transform,width,height] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: rect.width, height: rect.height, transform: `translate(${rect.left}px, ${rect.top}px)` }}
        />
      )}
      {NAV_ITEMS.map((item) => (
        <li
          key={item.key}
          ref={(el) => {
            if (el) itemRefs.current.set(item.key, el);
            else itemRefs.current.delete(item.key);
          }}
        >
          <button
            type="button"
            className={cn(
              "relative z-10 w-full cursor-pointer rounded-md text-left text-sm font-semibold text-muted-foreground transition-colors",
              variant === "sidebar" ? "flex items-center py-[10px] px-3" : "px-3 py-2",
              item.key === active && "text-foreground",
            )}
            aria-current={item.key === active ? "page" : undefined}
            onClick={() => onNavigate?.(item.key)}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

interface AppShellProps {
  active: NavKey;
  onNavigate?: (key: NavKey) => void;
  children: ReactNode;
  /** Rendered between the wordmark and the nav in the desktop sidebar — a slot rather than a hard dependency here, so AppShell itself stays presentation-only (no Clerk/fetch concern, per its own test file). Home passes `<WatchTimeStat variant="sidebar" />` (#1's Solution section: "the sidebar shows your Watch Time and rank at all times"). */
  sidebarExtra?: ReactNode;
  /** Same slot, compact treatment, next to the nav tabs in the mobile top strip. */
  topStripExtra?: ReactNode;
}

/**
 * Desktop: a left sidebar. Under 720px: a sticky top-tab strip instead.
 * Both nav renderings live in the DOM at all times — CSS toggles which one
 * is visible per breakpoint — so there's no client-side width detection and
 * no hydration mismatch between server and browser.
 */
export function AppShell({ active, onNavigate, children, sidebarExtra, topStripExtra }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col min-[720px]:flex-row">
      <nav
        aria-label="Primary"
        className="hidden min-[720px]:flex min-[720px]:w-60 min-[720px]:flex-col min-[720px]:gap-1 min-[720px]:border-r min-[720px]:border-border min-[720px]:py-6 min-[720px]:px-4"
      >
        <Wordmark className="mx-2 mb-8" />
        {sidebarExtra && <div className="mx-2 mb-6">{sidebarExtra}</div>}
        <NavList active={active} onNavigate={onNavigate} variant="sidebar" />
      </nav>
      <nav
        aria-label="Primary"
        className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background px-3 py-2 min-[720px]:hidden"
      >
        <NavList active={active} onNavigate={onNavigate} variant="topStrip" />
        {topStripExtra}
      </nav>
      <main className="min-w-0 flex-1 px-3 pt-4 pb-[100px] min-[720px]:px-8 min-[720px]:pt-6">
        {children}
      </main>
    </div>
  );
}
