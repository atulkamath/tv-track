"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { formatWatchTime } from "@/lib/format-watch-time";

/** The NestJS backend this frontend calls cross-origin (ADR 0004). Re-declared locally, not imported, to avoid a circular import with Home.tsx — same pattern as PosterGrid.tsx / Leaderboard.tsx. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** The backend's wire shape (snake_case) for one leaderboard row — see backend/src/leaderboard/leaderboard.dto.ts. */
interface LeaderboardEntryResponse {
  id: string;
  watch_time_minutes: number;
  is_self: boolean;
}

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; minutes: number; rank: number };

interface WatchTimeDisplayProps {
  variant: "sidebar" | "topStrip";
  minutes: number;
  rank: number;
}

/** Pure presentation, no fetch — shared by Home's two `useWatchTime`-fed instances and Hero's static app preview, so they can never visually drift apart. */
export function WatchTimeDisplay({ variant, minutes, rank }: WatchTimeDisplayProps) {
  if (variant === "topStrip") {
    return (
      <p className="flex items-baseline gap-1.5 text-sm font-bold tabular-nums">
        {formatWatchTime(minutes)}
        <span className="text-xs font-semibold text-muted-foreground">#{rank}</span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-muted/50 px-3 py-2.5">
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Watch Time</span>
      <span className="text-2xl leading-tight font-extrabold tabular-nums">{formatWatchTime(minutes)}</span>
      <span className="text-xs font-semibold text-muted-foreground">Rank #{rank}</span>
    </div>
  );
}

/**
 * "The sidebar shows your Watch Time and rank at all times" (#1's Solution
 * section; stories #70, #77–82) — built against #19's finding that
 * `GET /me/watch-time` existed on the backend but was never called from
 * anywhere in the frontend.
 *
 * Reads `GET /leaderboard` rather than `GET /me/watch-time`, even though
 * only the caller's own number is shown here: rank needs the full sorted
 * list regardless, and `LeaderboardService` already includes the caller
 * even with zero friends (`people = [user, ...friendships]`), so this one
 * call covers both numbers and both the with-friends and zero-friends
 * cases without a separate request. It also keeps this number and the
 * Leaderboard screen's own numbers provably in agreement (story #89) —
 * same query, not two independent computations that could momentarily
 * disagree.
 *
 * Fails quietly (callers render nothing) rather than showing an alert: this
 * is persistent chrome, not a primary content area, and a real outage is
 * already visible on the Leaderboard tab itself.
 *
 * A hook, not a self-fetching component: Home renders this twice (sidebar +
 * mobile top strip), which as two components meant two `GET /leaderboard`.
 */
export function useWatchTime(refreshKey?: number): LoadState {
  const { getToken } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = await getToken();
      if (!token || cancelled) return;

      try {
        const response = await fetch(`${API_URL}/leaderboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`GET /leaderboard failed: ${response.status}`);
        const entries = (await response.json()) as LeaderboardEntryResponse[];
        const rank = entries.findIndex((entry) => entry.is_self) + 1;
        const self = entries[rank - 1];
        if (!cancelled && self) {
          setState({ status: "ready", minutes: self.watch_time_minutes, rank });
        }
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // `refreshKey` isn't read above — it's a deliberate re-fetch trigger the
    // caller bumps after a mutation, same as PosterGrid's/Leaderboard's own.
  }, [getToken, refreshKey]);

  return state;
}
