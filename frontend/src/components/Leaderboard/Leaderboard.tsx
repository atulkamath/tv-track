"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatWatchTime } from "@/lib/format-watch-time";

export interface LeaderboardEntry {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** Watch Time (CONTEXT.md) — live sum of watched episode runtimes, in minutes. */
  watchTimeMinutes: number;
  /** Set by the backend from the caller's own session — never derived client-side. */
  isSelf: boolean;
}

interface LeaderboardProps {
  /** Wired to the Settings "Add a friend" flow once that ticket lands. */
  onAddFriend?: () => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; entries: LeaderboardEntry[] };

const PODIUM_CLASSES = ["text-gold", "text-silver", "text-bronze"] as const;

/**
 * Leaderboard = plain ranked list (docs/design.md, max 560px): rank numeral
 * (podium colors top 3), avatar, name, one big right-aligned time. The
 * caller's own row is the only loud element — accent outline, dark red
 * tint, red YOU chip.
 *
 * Owns its `GET /leaderboard` fetch rather than taking data as a prop —
 * frontend tests fake the network via MSW (see Leaderboard.spec.tsx) rather
 * than a live backend, which doesn't have this route yet (#15). The fetch
 * path is relative and unauthenticated for now; wiring a real API base URL
 * and the Clerk token both land with the frontend's auth-integration ticket.
 */
export function Leaderboard({ onAddFriend }: LeaderboardProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch("/leaderboard")
      .then((res) => {
        if (!res.ok) throw new Error(`GET /leaderboard failed: ${res.status}`);
        return res.json() as Promise<LeaderboardEntry[]>;
      })
      .then((entries) => {
        if (!cancelled) setState({ status: "ready", entries });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading leaderboard…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Couldn&apos;t load the leaderboard. Try refreshing.
      </p>
    );
  }

  const { entries } = state;

  // "Zero Friends" per CONTEXT.md means the caller sees only themself.
  if (entries.length <= 1) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          It&apos;s just you so far. Add a friend to start the race.
        </p>
        <Button onClick={onAddFriend}>Add a friend</Button>
      </div>
    );
  }

  return (
    <ol aria-label="Leaderboard" className="mx-auto flex w-full max-w-[560px] flex-col">
      {entries.map((entry, index) => (
        <LeaderboardRow key={entry.id} rank={index + 1} entry={entry} />
      ))}
    </ol>
  );
}

function LeaderboardRow({ rank, entry }: { rank: number; entry: LeaderboardEntry }) {
  const podiumClass = PODIUM_CLASSES[rank - 1];

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2",
        entry.isSelf
          ? "border border-primary bg-primary/10"
          : "border-b border-[var(--line-soft)] last:border-b-0",
      )}
    >
      <span
        className={cn(
          "w-6 shrink-0 text-right text-sm font-bold tabular-nums",
          podiumClass ?? "text-muted-foreground",
        )}
      >
        {rank}
      </span>
      <Avatar>
        {entry.avatarUrl ? <AvatarImage src={entry.avatarUrl} alt="" /> : null}
        <AvatarFallback>{initials(entry.name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.name}</span>
      {entry.isSelf && (
        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
          YOU
        </span>
      )}
      <span className="shrink-0 text-right text-base font-bold tabular-nums">
        {formatWatchTime(entry.watchTimeMinutes)}
      </span>
    </li>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
