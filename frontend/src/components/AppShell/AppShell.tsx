"use client";

import type { ReactNode } from "react";
import styles from "./AppShell.module.css";

export type NavKey = "home" | "leaderboard" | "settings";

const NAV_ITEMS: { key: NavKey; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "settings", label: "Settings" },
];

interface NavListProps {
  active: NavKey;
  onNavigate?: (key: NavKey) => void;
}

function NavList({ active, onNavigate }: NavListProps) {
  return (
    <ul className={styles.navList}>
      {NAV_ITEMS.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            className={`${styles.navItem} ${item.key === active ? styles.navItemActive : ""}`}
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
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label="Primary">
        <div className={styles.wordmark}>
          tv<span className={styles.wordmarkDot}>·</span>track
        </div>
        <NavList active={active} onNavigate={onNavigate} />
      </nav>
      <nav className={styles.topStrip} aria-label="Primary">
        <NavList active={active} onNavigate={onNavigate} />
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
