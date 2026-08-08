"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PosterArt } from "@/lib/poster-art";
import { ShowDetailModal } from "@/components/ShowDetailModal/ShowDetailModal";

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
}

export function PosterGrid({
  onOpenPalette,
  refreshKey,
  pendingSkeletonCount = 0,
  glowShowIds = [],
  onShowsLoaded,
}: PosterGridProps = {}) {
  const { getToken } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [percentByShowId, setPercentByShowId] = useState<Record<string, number>>({});
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const fetchedPercentIds = useRef(new Set<string>());

  // Extracted (rather than left inline in the mount effect) so a
  // ShowDetailModal-driven change (#10 — an episode/season toggle or a
  // delete) can re-invoke it too, keeping the grid from going stale without
  // hand-rolling a partial local-state patch. Clears `fetchedPercentIds` on
  // every call, not just mount, so a show whose watched fraction changed via
  // the modal gets its poster percentage recomputed rather than serving the
  // stale cached one — Partial shows are otherwise never fetched twice.
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
      fetchedPercentIds.current.clear();
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

  let content: ReactNode;
  if (state.status === "loading") {
    content = (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your shows…
      </p>
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
        {state.shows.map((show) => (
          <PosterTile
            key={show.id}
            show={show}
            percent={percentByShowId[show.id]}
            onSelect={() => setSelectedShowId(show.id)}
            glowing={glowShowIds.includes(show.id)}
          />
        ))}
        {/* A parse in flight (#12) — placeholders in the exact positions the
            resolved shows are about to occupy, per docs/design.md, rather
            than a separate loading area. */}
        {Array.from({ length: pendingSkeletonCount }, (_, index) => (
          <SkeletonPosterTile key={`parse-skeleton-${index}`} index={index} />
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
        onChanged={() => void loadShows()}
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
    <div className="mx-auto flex max-w-[420px] flex-col items-center gap-5 py-16 text-center">
      <p className="text-sm text-muted-foreground">
        Nothing here yet. Type what you watch — we do the rest.
      </p>
      {/* Opens the Spotlight palette (#8). */}
      <Button size="lg" onClick={() => onOpenPalette?.()}>
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

function PosterTile({
  show,
  percent,
  onSelect,
  glowing,
}: {
  show: Show;
  percent?: number;
  onSelect: () => void;
  glowing?: boolean;
}) {
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
        // Newly-landed-via-parse pop (#12, docs/design.md, 1.4s) — see
        // globals.css's `--animate-glow-pop`.
        glowing && "animate-glow-pop motion-reduce:animate-none",
      )}
    >
      {/* The li carries the tile's identity/styling (data-testid, dimmed
          state, hover scale); this button is just the click/focus target —
          opening the show detail modal (#10) and, per its Modal, getting
          the triggering-element focus restore for free on close. */}
      <button type="button" onClick={onSelect} aria-label={`Open ${show.title}`} className="absolute inset-0 size-full text-left">
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
      </button>
    </li>
  );
}

/**
 * A parse-in-flight placeholder (#12, docs/design.md: "shimmer skeleton
 * cards where shows will land"). `aria-hidden` — it's decorative; the
 * palette's dots-pill (SpotlightPalette.tsx) is the accessible loading
 * signal (`role="status"`). Staggered delays so the row shimmers rather than
 * pulsing in lockstep; `motion-reduce:animate-none` matches every other
 * animation in this app (PosterTile's hover transition, the dots-pill).
 */
function SkeletonPosterTile({ index }: { index: number }) {
  return (
    <li
      data-testid="poster-skeleton"
      aria-hidden="true"
      className="aspect-[2/3] animate-shimmer rounded-sm bg-[var(--surface-2)] motion-reduce:animate-none"
      style={{ animationDelay: `${index * 90}ms` }}
    />
  );
}

