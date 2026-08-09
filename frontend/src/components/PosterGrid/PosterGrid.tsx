"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PosterArt } from "@/lib/poster-art";
import { ShowDetailModal } from "@/components/ShowDetailModal/ShowDetailModal";

/** The NestJS backend this frontend calls cross-origin (ADR 0004). Same constant Home.tsx defines for its own fetch. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

/** Full/Partial/None, per CONTEXT.md → Watch State. */
type WatchState = "full" | "partial" | "none";

/** The wire shape of one `GET /shows` card. Snake-case, matching the backend (show.dto.ts). `watched_count`/`episode_count` (#19) are what let this component compute an exact Partial percentage from this response alone — see `percentFor` below. */
interface ShowCardWire {
  id: string;
  title: string;
  poster_path: string | null;
  watch_state: WatchState;
  watched_count: number;
  episode_count: number;
}

interface Show {
  id: string;
  title: string;
  posterUrl: string | null;
  watchState: WatchState;
  watchedCount: number;
  episodeCount: number;
}

function mapShow(card: ShowCardWire): Show {
  return {
    id: card.id,
    title: card.title,
    posterUrl: card.poster_path ? `${TMDB_IMAGE_BASE}${card.poster_path}` : null,
    watchState: card.watch_state,
    watchedCount: card.watched_count,
    episodeCount: card.episode_count,
  };
}

/** A Partial show's exact watched percentage, straight from `GET /shows` — see #19: this used to require a follow-up `GET /shows/:id` per Partial show just to count episodes. */
function percentFor(show: Show): number {
  return show.episodeCount === 0 ? 0 : Math.round((show.watchedCount / show.episodeCount) * 100);
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
 * A Partial poster needs a real percentage (docs/design.md), and
 * `GET /shows` carries `watched_count`/`episode_count` alongside
 * `watch_state` (#19) precisely so that number is exact without any
 * follow-up request — a fixed/half-filled bar would be lying with more
 * confidence than showing nothing, so this never approximates it.
 */
interface PosterGridProps {
  /** Opens the Spotlight palette (#8) — wired to the "+ Log watching" empty-state button. Optional so existing call sites/tests that don't care about the palette don't have to pass a no-op. */
  onOpenPalette?: () => void;
  /** Bumped by the caller (Home) after a Spotlight-palette add so this component refetches `GET /shows` and the grid doesn't go stale. */
  refreshKey?: number;
  /**
   * How many shimmer skeleton cards to render while a Spotlight-palette
   * parse (#12, `POST /shows/parse`) is in flight — lifted up through
   * Home.tsx from SpotlightPalette's `onParseStart`, the same way
   * `refreshKey` is, so the placeholders land on the wall itself, in the
   * positions the resolved shows are about to occupy (docs/design.md:
   * "skeleton cards where shows will land"), not just inside the palette.
   */
  pendingSkeletonCount?: number;
  /**
   * Show ids that just landed via a parse and should pop with a brief
   * accent glow (docs/design.md, 1.4s) before settling — lifted from
   * SpotlightPalette's `onParseSettled` via Home.tsx, so only the
   * newly-resolved tiles glow rather than the whole grid re-rendering.
   */
  glowShowIds?: string[];
  /**
   * Fired every time a `GET /shows` attempt settles — success or failure,
   * always, so a caller gating on it (Home.tsx's Disambiguation Step, #13:
   * "shown only after resolved shows are already visible") never gets stuck
   * waiting on a refetch that errored out.
   */
  onShowsLoaded?: () => void;
  /**
   * Fired whenever a mutation inside this component could have changed the
   * caller's Watch Time (#19/#1's sidebar Watch Time) — an empty-state
   * example add, or an episode/season toggle, mark-all, or delete inside
   * the Show Detail modal. Distinct from `onShowsLoaded`/`refreshKey`:
   * those are about the *grid's own* `GET /shows` refetch, and reusing
   * either one here would make this component refetch itself twice for
   * the same mutation. This is purely a signal outward, for Home to bump
   * its own separate Watch Time refresh trigger.
   */
  onShowsChanged?: () => void;
}

export function PosterGrid({
  onOpenPalette,
  refreshKey,
  pendingSkeletonCount = 0,
  glowShowIds = [],
  onShowsLoaded,
  onShowsChanged,
}: PosterGridProps = {}) {
  const { getToken } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);

  // Extracted (rather than left inline in the mount effect) so a
  // ShowDetailModal-driven change (#10 — an episode/season toggle or a
  // delete) can re-invoke it too, keeping the grid from going stale without
  // hand-rolling a partial local-state patch.
  const loadShows = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      onShowsLoaded?.();
      return;
    }

    try {
      const response = await fetch(`${API_URL}/shows`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`GET /shows failed: ${response.status}`);
      const cards = (await response.json()) as ShowCardWire[];
      setState({ status: "ready", shows: cards.map(mapShow) });
    } catch {
      setState({ status: "error" });
    } finally {
      onShowsLoaded?.();
    }
  }, [getToken, onShowsLoaded]);

  useEffect(() => {
    // Wrapped in its own async IIFE, matching SpotlightPalette.tsx's
    // cancellation pattern — the react-hooks lint (no synchronous setState
    // in an effect) flags a stateful callback invoked directly in an
    // effect's own scope, but not one reached through an async function the
    // effect merely kicks off.
    void (async () => {
      await loadShows();
    })();
    // `refreshKey` isn't read above — it's a deliberate re-fetch trigger the
    // caller bumps after a Spotlight-palette add, per #8.
  }, [loadShows, refreshKey]);

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
    onShowsChanged?.();
  }

  let content: ReactNode;
  if (state.status === "loading") {
    // The shimmer skeleton isn't parse-only (#12) — the very first
    // `GET /shows` on mount deserves the same treatment rather than plain
    // loading text. `role="status"` + the sr-only line keep the existing
    // accessible announcement; the grid itself is decorative.
    content = (
      <div role="status">
        <span className="sr-only">Loading your shows…</span>
        <ul
          className="grid list-none grid-cols-3 gap-4 min-[720px]:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]"
          aria-hidden="true"
        >
          {Array.from({ length: 12 }, (_, index) => (
            <SkeletonPosterTile key={index} testId="poster-skeleton-loading" />
          ))}
        </ul>
      </div>
    );
  } else if (state.status === "error") {
    content = (
      <p role="alert" className="text-sm text-muted-foreground">
        Couldn&apos;t load your shows. Try refreshing.
      </p>
    );
  } else if (state.shows.length === 0 && pendingSkeletonCount === 0) {
    content = <EmptyState onAddExample={handleAddExample} onOpenPalette={onOpenPalette} />;
  } else {
    content = (
      <ul
        className="grid list-none grid-cols-3 gap-4 min-[720px]:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]"
        aria-label="Shows"
      >
        {state.shows.map((show, index) => (
          <PosterTile
            key={show.id}
            show={show}
            index={index}
            onSelect={() => setSelectedShowId(show.id)}
            glowing={glowShowIds.includes(show.id)}
          />
        ))}
        {/* A parse in flight (#12) — placeholders in the exact positions the
            resolved shows are about to occupy, per docs/design.md, rather
            than a separate loading area. */}
        {Array.from({ length: pendingSkeletonCount }, (_, index) => (
          <SkeletonPosterTile key={`parse-skeleton-${index}`} />
        ))}
      </ul>
    );
  }

  return (
    <>
      {content}
      {/* Rendered alongside every branch above (not just the populated grid)
          so a selection made before a refetch settles doesn't get
          unexpectedly unmounted mid-interaction — e.g. if the follow-up
          `GET /shows` triggered by `onChanged` itself fails. */}
      <ShowDetailModal
        showId={selectedShowId}
        open={selectedShowId !== null}
        onClose={() => setSelectedShowId(null)}
        onChanged={() => {
          void loadShows();
          onShowsChanged?.();
        }}
      />
    </>
  );
}

function EmptyState({
  onAddExample,
  onOpenPalette,
}: {
  onAddExample: (tmdbId: number) => void;
  onOpenPalette?: () => void;
}) {
  return (
    <div className="flex flex-col gap-10">
      <div className="mx-auto flex max-w-[420px] animate-empty-in flex-col items-center gap-5 py-12 text-center motion-reduce:animate-none">
        <p className="text-sm text-muted-foreground">
          Nothing here yet. Type what you watch — we do the rest.
        </p>
        {/* Opens the Spotlight palette (#8). The one other spot (besides the
            FAB, Home.tsx) that gets the brand accent — this and the FAB are
            the same action, so they match. */}
        <Button size="lg" onClick={() => onOpenPalette?.()} className="bg-brand text-brand-foreground hover:bg-brand/90">
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
      {/* Decorative — hints this is a wall waiting to be filled, not the real (interactive, aria-label="Shows") grid. */}
      <ul aria-hidden="true" className="grid list-none grid-cols-3 gap-4 min-[720px]:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]">
        {Array.from({ length: 12 }, (_, index) => (
          <li key={index} className="aspect-[2/3] rounded-sm border border-dashed border-border/50 bg-muted/10" />
        ))}
      </ul>
    </div>
  );
}

/** How many tiles get a staggered entrance delay before it caps out — a wall of 100 shows shouldn't leave the last tile waiting seconds to appear. */
const MAX_STAGGERED_TILES = 20;

function PosterTile({
  show,
  index,
  onSelect,
  glowing,
}: {
  show: Show;
  index: number;
  onSelect: () => void;
  glowing?: boolean;
}) {
  const isFull = show.watchState === "full";
  const isPartial = show.watchState === "partial";
  const isNone = show.watchState === "none";
  const percent = percentFor(show);
  const fillPercent = isFull ? 100 : isPartial ? percent : 0;

  return (
    <li
      data-testid="poster-tile"
      data-watch-state={show.watchState}
      className={cn(
        // Scale only, nothing else — matches shadcn's own flat hover style. Plain ease-out, not a custom bezier — simpler reads smoother than fancier here.
        "relative aspect-[2/3] animate-tile-in overflow-hidden rounded-sm shadow-md transition-[transform,filter] duration-150 ease-out hover:z-10 hover:scale-[1.05] motion-reduce:animate-none motion-reduce:transition-none",
        isNone && "brightness-[.6] saturate-[.8] hover:brightness-100 hover:saturate-100",
        // Newly-landed-via-parse pop (#12) — see globals.css's `--animate-glow-pop`.
        glowing && "animate-glow-pop motion-reduce:animate-none",
      )}
      style={{ animationDelay: `${Math.min(index, MAX_STAGGERED_TILES) * 30}ms` }}
    >
      {/* The li carries the tile's identity/styling (data-testid, dimmed
          state, hover scale); this button is just the click/focus target —
          opening the show detail modal (#10) and, per its Modal, getting
          the triggering-element focus restore for free on close. */}
      <button type="button" onClick={onSelect} aria-label={`Open ${show.title}`} className="absolute inset-0 size-full cursor-pointer text-left">
        <PosterArt title={show.title} posterUrl={show.posterUrl} />
        {isFull && (
          <span
            aria-label="Full"
            className="absolute top-2 right-2 flex size-[22px] items-center justify-center rounded-full bg-green-500 text-white"
          >
            <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
          </span>
        )}
        {isPartial && (
          <span className="absolute right-1.5 bottom-2.5 text-[11px] font-bold text-white">{percent}%</span>
        )}
        <div className="absolute inset-x-0 bottom-0 overflow-hidden bg-gradient-to-t from-black/85 to-transparent px-2 pt-8 pb-2">
          <span className="block truncate text-sm font-bold text-white">{show.title}</span>
        </div>
        {!isNone && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-muted">
            <div
              className={cn("h-full", isFull ? "bg-green-500" : "bg-brand")}
              style={{ width: `${fillPercent}%` }}
            />
          </div>
        )}
      </button>
    </li>
  );
}

/**
 * The stock shadcn `Skeleton` (`animate-pulse bg-muted`) — for a parse in
 * flight (#12) and for the ordinary first `GET /shows` on mount alike.
 * `aria-hidden` in both cases: the accessible loading signal is the
 * `role="status"` wrapper around it (either the palette's dots-pill or this
 * grid's own sr-only text), not these tiles themselves. Every tile pulses
 * in sync, not staggered — shadcn's own component has no per-instance
 * delay, and a unified pulse reads as more deliberate than a chasing wave.
 * `motion-reduce:animate-none` is added on top since the stock component
 * doesn't opt out of motion itself, unlike everything else in this app.
 */
function SkeletonPosterTile({ testId = "poster-skeleton" }: { testId?: string }) {
  return (
    <li aria-hidden="true">
      <Skeleton data-testid={testId} className="aspect-[2/3] rounded-sm motion-reduce:animate-none" />
    </li>
  );
}

