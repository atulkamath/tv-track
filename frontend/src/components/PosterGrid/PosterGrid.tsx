"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** The NestJS backend this frontend calls cross-origin (ADR 0004). Same constant Home.tsx defines for its own fetch. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

/** Full/Partial/None, per CONTEXT.md → Watch State. */
type WatchState = "full" | "partial" | "none";

/** The wire shape of one `GET /shows` card. Snake-case, matching the backend. */
interface ShowCardWire {
  id: string;
  title: string;
  poster_path: string | null;
  watch_state: WatchState;
}

interface EpisodeDetailWire {
  watched: boolean;
}

interface SeasonDetailWire {
  episodes: EpisodeDetailWire[];
}

/** The wire shape of `GET /shows/:id` — only the fields this component needs. */
interface ShowDetailWire {
  seasons: SeasonDetailWire[];
}

interface Show {
  id: string;
  title: string;
  posterUrl: string | null;
  watchState: WatchState;
}

function mapShow(card: ShowCardWire): Show {
  return {
    id: card.id,
    title: card.title,
    posterUrl: card.poster_path ? `${TMDB_IMAGE_BASE}${card.poster_path}` : null,
    watchState: card.watch_state,
  };
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; shows: Show[] };

/**
 * Safe, stable, well-known TMDB ids for the empty-state examples — the
 * Spotlight palette (#8) doesn't exist yet, so clicking one of these has to
 * add the real show itself rather than open a flow that isn't built.
 */
const EMPTY_STATE_EXAMPLES: { label: string; tmdbId: number }[] = [
  { label: "Breaking Bad", tmdbId: 1396 },
  { label: "The Office", tmdbId: 2316 },
  { label: "The Wire", tmdbId: 1438 },
];

/**
 * Home's poster wall (docs/design.md → "Signature element: the poster
 * carries the state"). Owns its `GET /shows` fetch the same way Leaderboard
 * owns `GET /leaderboard` — tests fake the network via MSW rather than a
 * live backend — following Home.tsx's auth pattern (Clerk `getToken` →
 * `Authorization: Bearer`) since, unlike Leaderboard, this route is real
 * and requires it.
 *
 * `GET /shows` only reports the coarse `watch_state` enum, not a watched
 * fraction, but a Partial poster needs a real percentage (docs/design.md).
 * Rather than approximate it, each Partial show gets a follow-up
 * `GET /shows/:id` call (already built — full season/episode tree with
 * per-episode `watched`) to compute the exact watched/total fraction. This
 * is more requests than guessing, but it's the only way to show a number
 * that's actually true; a fixed/half-filled bar would be lying with more
 * confidence than showing nothing. Flagging this as a real gap regardless:
 * `GET /shows` returning `watched_count`/`episode_count` alongside
 * `watch_state` would let the grid render correct percentages in one
 * request instead of N+1 — worth a follow-up ticket.
 */
export function PosterGrid() {
  const { getToken } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [percentByShowId, setPercentByShowId] = useState<Record<string, number>>({});
  const fetchedPercentIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    async function loadShows() {
      const token = await getToken();
      if (!token || cancelled) return;

      try {
        const response = await fetch(`${API_URL}/shows`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`GET /shows failed: ${response.status}`);
        const cards = (await response.json()) as ShowCardWire[];
        if (!cancelled) setState({ status: "ready", shows: cards.map(mapShow) });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    }

    void loadShows();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const toFetch = state.shows.filter(
      (show) => show.watchState === "partial" && !fetchedPercentIds.current.has(show.id),
    );
    if (toFetch.length === 0) return;
    toFetch.forEach((show) => fetchedPercentIds.current.add(show.id));

    let cancelled = false;

    async function loadPercents() {
      const token = await getToken();
      if (!token || cancelled) return;

      await Promise.all(
        toFetch.map(async (show) => {
          try {
            const response = await fetch(`${API_URL}/shows/${show.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) return;
            const detail = (await response.json()) as ShowDetailWire;
            const episodes = detail.seasons.flatMap((season) => season.episodes);
            const watched = episodes.filter((episode) => episode.watched).length;
            const percent = episodes.length === 0 ? 0 : Math.round((watched / episodes.length) * 100);
            if (!cancelled) setPercentByShowId((prev) => ({ ...prev, [show.id]: percent }));
          } catch {
            // Leave this show's percent unset — the poster falls back to an
            // unlabeled partial-width bar rather than a wrong number.
          }
        }),
      );
    }

    void loadPercents();
    return () => {
      cancelled = true;
    };
  }, [state, getToken]);

  async function handleAddExample(tmdbId: number) {
    const token = await getToken();
    if (!token) return;

    const response = await fetch(`${API_URL}/shows`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tmdb_id: tmdbId }),
    });
    if (!response.ok) return;

    const card = (await response.json()) as ShowCardWire;
    const show = mapShow(card);
    setState((prev) => ({
      status: "ready",
      shows: prev.status === "ready" ? [...prev.shows, show] : [show],
    }));
  }

  if (state.status === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your shows…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Couldn&apos;t load your shows. Try refreshing.
      </p>
    );
  }

  if (state.shows.length === 0) {
    return <EmptyState onAddExample={handleAddExample} />;
  }

  return (
    <ul
      className="grid list-none grid-cols-3 gap-4 min-[720px]:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]"
      aria-label="Shows"
    >
      {state.shows.map((show) => (
        <PosterTile key={show.id} show={show} percent={percentByShowId[show.id]} />
      ))}
    </ul>
  );
}

function EmptyState({ onAddExample }: { onAddExample: (tmdbId: number) => void }) {
  return (
    <div className="mx-auto flex max-w-[420px] flex-col items-center gap-5 py-16 text-center">
      <p className="text-sm text-muted-foreground">
        Nothing here yet. Type what you watch — we do the rest.
      </p>
      {/* The Spotlight palette (#8) is what this should open — not built yet,
          so this is a stub that can't crash rather than a fake palette. */}
      <Button size="lg" onClick={() => {}}>
        + Log watching
      </Button>
      <div className="flex flex-wrap justify-center gap-2">
        {EMPTY_STATE_EXAMPLES.map((example) => (
          <Button key={example.tmdbId} variant="secondary" onClick={() => onAddExample(example.tmdbId)}>
            {example.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function PosterTile({ show, percent }: { show: Show; percent?: number }) {
  const isFull = show.watchState === "full";
  const isPartial = show.watchState === "partial";
  const isNone = show.watchState === "none";
  const fillPercent = isFull ? 100 : isPartial ? (percent ?? 50) : 0;

  return (
    <li
      data-testid="poster-tile"
      data-watch-state={show.watchState}
      className={cn(
        "relative aspect-[2/3] overflow-hidden rounded-sm shadow-card [transition:transform_180ms_ease] hover:scale-[1.045] motion-reduce:[transition:none]",
        isNone && "brightness-[.6] saturate-[.8] hover:brightness-100 hover:saturate-100",
      )}
    >
      <PosterArt title={show.title} posterUrl={show.posterUrl} />
      {isFull && (
        <span
          aria-label="Full"
          className="absolute top-2 right-2 flex size-[22px] items-center justify-center rounded-full bg-[var(--full)] text-white"
        >
          <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        </span>
      )}
      {isPartial && percent !== undefined && (
        <span className="absolute right-1.5 bottom-2.5 text-[11px] font-bold text-white">{percent}%</span>
      )}
      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent px-2 pt-6 pb-2 text-sm font-bold text-white">
        {show.title}
      </span>
      {!isNone && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-[var(--surface-2)]">
          <div className="h-full bg-[var(--accent-solid)]" style={{ width: `${fillPercent}%` }} />
        </div>
      )}
    </li>
  );
}

function PosterArt({ title, posterUrl }: { title: string; posterUrl: string | null }) {
  const [errored, setErrored] = useState(false);
  const showFallback = !posterUrl || errored;

  return (
    <div
      className="relative flex size-full items-center justify-center text-lg font-bold text-white"
      style={{ background: seededGradient(title) }}
    >
      {!showFallback && (
        <img
          src={posterUrl}
          alt={title}
          className="absolute inset-0 size-full object-cover"
          onError={() => setErrored(true)}
        />
      )}
      {showFallback && <span aria-hidden="true">{initials(title)}</span>}
    </div>
  );
}

function initials(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
}

/** Deterministic per-title background so a missing/unloaded poster is still readable and distinct, not a flat gray box. */
function seededGradient(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return `linear-gradient(160deg, hsl(${hue} 45% 22%), hsl(${(hue + 40) % 360} 40% 12%))`;
}
