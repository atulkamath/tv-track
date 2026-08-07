"use client";

import type { ReactNode } from "react";
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

function NavList({ active, onNavigate, variant }: NavListProps) {
  return (
    <ul
      className={cn(
        "flex list-none",
        variant === "sidebar" ? "flex-col gap-1" : "flex-row gap-2",
      )}
    >
      {NAV_ITEMS.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            className={cn(
              "w-full cursor-pointer rounded-md text-left text-sm font-semibold text-[var(--muted-hi)]",
              variant === "sidebar" ? "flex items-center py-[10px] px-3" : "px-3 py-2",
              item.key === active && "bg-secondary text-foreground shadow-inner",
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
}

/**
 * Desktop: a left sidebar. Under 720px: a sticky top-tab strip instead.
 * Both nav renderings live in the DOM at all times — CSS toggles which one
 * is visible per breakpoint — so there's no client-side width detection and
 * no hydration mismatch between server and browser.
 */
export function AppShell({ active, onNavigate, children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col min-[720px]:flex-row">
      <nav
        aria-label="Primary"
        className="hidden min-[720px]:flex min-[720px]:w-60 min-[720px]:flex-col min-[720px]:gap-1 min-[720px]:border-r min-[720px]:border-[var(--line)] min-[720px]:py-6 min-[720px]:px-4"
      >
        <Wordmark className="mx-2 mb-8" />
        <NavList active={active} onNavigate={onNavigate} variant="sidebar" />
      </nav>
      <nav
        aria-label="Primary"
        className="sticky top-0 z-10 border-b border-[var(--line)] bg-[image:var(--bg)] px-3 py-2 min-[720px]:hidden"
      >
        <NavList active={active} onNavigate={onNavigate} variant="topStrip" />
      </nav>
      <main className="min-w-0 flex-1 px-3 pt-4 pb-[100px] min-[720px]:px-8 min-[720px]:pt-6">
        {children}
      </main>
    </div>
  );
}
