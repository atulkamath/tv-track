"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatWatchTime } from "@/lib/format-watch-time";
import { API_URL } from "@/components/Home/Home";

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
  /** Bumped by Home after a Friend Request is accepted in Settings (#16) so this refetches immediately — same lifted-refresh-key pattern as PosterGrid's `refreshKey`. */
  refreshKey?: number;
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; entries: LeaderboardEntry[] };

const PODIUM_CLASSES = ["text-gold", "text-silver", "text-bronze"] as const;

/** The backend's wire shape (snake_case) for one row — see `backend/src/leaderboard/leaderboard.dto.ts`. */
interface LeaderboardEntryResponse {
  id: string;
  email: string;
  watch_time_minutes: number;
  is_self: boolean;
}

function toLeaderboardEntry(entry: LeaderboardEntryResponse): LeaderboardEntry {
  // The backend has no display-name concept (users/schema.prisma has no
  // `name` column) — email is the only identifying string it can offer.
  return {
    id: entry.id,
    name: entry.email,
    avatarUrl: null,
    watchTimeMinutes: entry.watch_time_minutes,
    isSelf: entry.is_self,
  };
}

/**
 * Leaderboard = plain ranked list (docs/design.md, max 560px): rank numeral
 * (podium colors top 3), avatar, name, one big right-aligned time. The
 * caller's own row is the only loud element — accent outline, dark red
 * tint, red YOU chip.
 *
 * Owns its `GET /leaderboard` fetch rather than taking data as a prop —
 * frontend tests fake the network via MSW (see Leaderboard.spec.tsx) rather
 * than a live backend.
 */
export function Leaderboard({ onAddFriend, refreshKey }: LeaderboardProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const { getToken } = useAuth();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = await getToken();
      const res = await fetch(`${API_URL}/leaderboard`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`GET /leaderboard failed: ${res.status}`);
      const body = (await res.json()) as LeaderboardEntryResponse[];
      return body.map(toLeaderboardEntry);
    }

    load()
      .then((entries) => {
        if (!cancelled) setState({ status: "ready", entries });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
    // `refreshKey` isn't read above — it's a deliberate re-fetch trigger the
    // caller bumps after a mutation, same as PosterGrid.tsx's `refreshKey`.
  }, [getToken, refreshKey]);

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
