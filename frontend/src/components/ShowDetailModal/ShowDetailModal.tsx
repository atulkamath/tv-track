"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ChevronRight, RotateCcw, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/Modal/Modal";
import { Button } from "@/components/ui/button";
import { PosterArt } from "@/lib/poster-art";

/** The NestJS backend this frontend calls cross-origin (ADR 0004). Re-declared locally, not imported, to avoid a circular import with Home.tsx — same pattern as PosterGrid.tsx / SpotlightPalette.tsx. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

/** Full/Partial/None, per CONTEXT.md → Watch State. */
type WatchState = "full" | "partial" | "none";

/** The wire shape of one episode in `GET /shows/:id`. Snake-case, matching the backend (show.dto.ts). */
interface EpisodeWire {
  id: string;
  episode_number: number;
  runtime_minutes: number | null;
  watched: boolean;
}

/** The wire shape of one season in `GET /shows/:id`. `watch_state` is server-derived — never recomputed here. */
interface SeasonWire {
  season_number: number;
  watch_state: WatchState;
  episodes: EpisodeWire[];
}

/** The wire shape of `GET /shows/:id` (`ShowDetailDto`). No show-level `watch_state` — the header's count is a client-side sum. */
interface ShowDetailWire {
  id: string;
  title: string;
  poster_path: string | null;
  rewatch_count: number;
  seasons: SeasonWire[];
}

interface Episode {
  id: string;
  episodeNumber: number;
  runtimeMinutes: number | null;
  watched: boolean;
}

interface Season {
  seasonNumber: number;
  watchState: WatchState;
  episodes: Episode[];
}

interface ShowDetail {
  id: string;
  title: string;
  posterUrl: string | null;
  rewatchCount: number;
  seasons: Season[];
}

function mapShowDetail(wire: ShowDetailWire): ShowDetail {
  return {
    id: wire.id,
    title: wire.title,
    posterUrl: wire.poster_path ? `${TMDB_IMAGE_BASE}${wire.poster_path}` : null,
    rewatchCount: wire.rewatch_count,
    seasons: wire.seasons.map((season) => ({
      seasonNumber: season.season_number,
      watchState: season.watch_state,
      episodes: season.episodes.map((episode) => ({
        id: episode.id,
        episodeNumber: episode.episode_number,
        runtimeMinutes: episode.runtime_minutes,
        watched: episode.watched,
      })),
    })),
  };
}

function watchStateLabel(state: WatchState): string {
  if (state === "full") return "Full";
  if (state === "partial") return "Partial";
  return "Not started";
}

/** Same color language as the poster grid's checkmark/progress-bar — full green, partial brand, not-started neutral. */
function watchStateDotClass(state: WatchState): string {
  if (state === "full") return "bg-green-500";
  if (state === "partial") return "bg-brand";
  return "bg-muted-foreground/40";
}

/** Replaces one episode's `watched` flag, leaving every other season/episode untouched — used for the single-episode optimistic tick. */
function withEpisodeWatched(detail: ShowDetail, seasonNumber: number, episodeId: string, watched: boolean): ShowDetail {
  return {
    ...detail,
    seasons: detail.seasons.map((season) =>
      season.seasonNumber !== seasonNumber
        ? season
        : { ...season, episodes: season.episodes.map((episode) => (episode.id === episodeId ? { ...episode, watched } : episode)) },
    ),
  };
}

/** Sets every episode in one season, leaving other seasons untouched — used for the season mark-all optimistic tick. */
function withSeasonWatched(detail: ShowDetail, seasonNumber: number, watched: boolean): ShowDetail {
  return {
    ...detail,
    seasons: detail.seasons.map((season) =>
      season.seasonNumber !== seasonNumber ? season : { ...season, episodes: season.episodes.map((episode) => ({ ...episode, watched })) },
    ),
  };
}

/** Sets every episode across every season — used for the show mark-all optimistic tick. Unmarking clears the rewatch tally with it. */
function withShowWatched(detail: ShowDetail, watched: boolean): ShowDetail {
  return {
    ...detail,
    rewatchCount: watched ? detail.rewatchCount : 0,
    seasons: detail.seasons.map((season) => ({ ...season, episodes: season.episodes.map((episode) => ({ ...episode, watched })) })),
  };
}

/** Rewatching changes no episode's watched flag — only the tally, which floors at 0. */
function withRewatchDelta(detail: ShowDetail, delta: number): ShowDetail {
  return { ...detail, rewatchCount: Math.max(0, detail.rewatchCount + delta) };
}

type DetailState = { status: "loading" } | { status: "error" } | { status: "ready"; detail: ShowDetail };

interface ShowDetailModalProps {
  showId: string | null;
  open: boolean;
  onClose: () => void;
  /** Called once per settled batch of changes (a toggle, a mark-all, or a delete) so the caller (PosterGrid) can refetch `GET /shows`. */
  onChanged?: () => void;
}

/**
 * Show detail modal: poster + title + one context-sensitive mark-all button,
 * then seasons collapsed by default, expanding to per-episode checkboxes.
 * Mutations are optimistic, reverted with an inline alert on failure.
 */
export function ShowDetailModal({ showId, open, onClose, onChanged }: ShowDetailModalProps) {
  const { getToken } = useAuth();
  const [detailState, setDetailState] = useState<DetailState>({ status: "loading" });
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busySeasons, setBusySeasons] = useState<Set<number>>(new Set());
  const [showActionBusy, setShowActionBusy] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open || !showId) return;
    let cancelled = false;

    // Every state transition lives inside this async callback rather than
    // directly in the effect body — same cancellation pattern as
    // PosterGrid.tsx / SpotlightPalette.tsx.
    void (async () => {
      setDetailState({ status: "loading" });
      setErrorMessage(null);
      try {
        const token = await getToken();
        if (cancelled) return;
        const response = await fetch(`${API_URL}/shows/${showId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        if (!response.ok) throw new Error(`GET /shows/${showId} failed: ${response.status}`);
        const wire = (await response.json()) as ShowDetailWire;
        if (!cancelled) setDetailState({ status: "ready", detail: mapShowDetail(wire) });
      } catch {
        if (!cancelled) setDetailState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, showId, getToken]);

  function toggleSeason(seasonNumber: number) {
    setExpandedSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(seasonNumber)) next.delete(seasonNumber);
      else next.add(seasonNumber);
      return next;
    });
  }

  async function handleToggleEpisode(seasonNumber: number, episode: Episode) {
    if (detailState.status !== "ready" || !showId) return;
    const previous = detailState.detail;
    const target = !episode.watched;

    setDetailState({ status: "ready", detail: withEpisodeWatched(previous, seasonNumber, episode.id, target) });
    setErrorMessage(null);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/shows/${showId}/episodes/${episode.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ watched: target }),
      });
      if (!response.ok) throw new Error(`PUT episode failed: ${response.status}`);
      const wire = (await response.json()) as ShowDetailWire;
      setDetailState({ status: "ready", detail: mapShowDetail(wire) });
      onChanged?.();
    } catch {
      setDetailState({ status: "ready", detail: previous });
      setErrorMessage(`Couldn't update episode ${episode.episodeNumber}. Try again.`);
    }
  }

  async function handleSeasonMarkAll(season: Season, watched: boolean) {
    if (detailState.status !== "ready" || !showId) return;
    const previous = detailState.detail;

    setDetailState({ status: "ready", detail: withSeasonWatched(previous, season.seasonNumber, watched) });
    setErrorMessage(null);
    setBusySeasons((prev) => new Set(prev).add(season.seasonNumber));
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/shows/${showId}/seasons/${season.seasonNumber}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ watched }),
      });
      if (!response.ok) throw new Error(`PUT season failed: ${response.status}`);
      const wire = (await response.json()) as ShowDetailWire;
      setDetailState({ status: "ready", detail: mapShowDetail(wire) });
      onChanged?.();
    } catch {
      setDetailState({ status: "ready", detail: previous });
      setErrorMessage(`Couldn't update season ${season.seasonNumber}. Try again.`);
    } finally {
      setBusySeasons((prev) => {
        const next = new Set(prev);
        next.delete(season.seasonNumber);
        return next;
      });
    }
  }

  async function handleShowMarkAll(watched: boolean) {
    if (detailState.status !== "ready" || !showId) return;
    const previous = detailState.detail;

    setDetailState({ status: "ready", detail: withShowWatched(previous, watched) });
    setErrorMessage(null);
    setShowActionBusy(true);
    try {
      const token = await getToken();
      // There's no show-level mark-all endpoint — fire the season-level PUT
      // once per season in parallel, per the ticket. Marking a whole show
      // watched/unwatched drives every season to the same all-or-nothing
      // result (full or none), so — unlike a single-episode toggle, whose
      // resulting season/show state is genuinely ambiguous without the
      // server — the post-batch season `watch_state` here is a known
      // constant, not a recomputation of the general partial-derivation
      // logic. That lets a full success skip a second reconciling GET.
      await Promise.all(
        previous.seasons.map(async (season) => {
          const response = await fetch(`${API_URL}/shows/${showId}/seasons/${season.seasonNumber}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ watched }),
          });
          if (!response.ok) throw new Error(`PUT season ${season.seasonNumber} failed: ${response.status}`);
        }),
      );
      const settled = withShowWatched(previous, watched);
      setDetailState({
        status: "ready",
        detail: {
          ...settled,
          seasons: settled.seasons.map((season) => ({ ...season, watchState: watched ? "full" : "none" })),
        },
      });
      onChanged?.();
    } catch {
      setDetailState({ status: "ready", detail: previous });
      setErrorMessage("Couldn't update all seasons. Try again.");
    } finally {
      setShowActionBusy(false);
    }
  }

  /** `delta` is +1 to log a rewatch, -1 to take one back. */
  async function handleRewatch(delta: 1 | -1) {
    if (detailState.status !== "ready" || !showId) return;
    const previous = detailState.detail;

    setDetailState({ status: "ready", detail: withRewatchDelta(previous, delta) });
    setErrorMessage(null);
    setShowActionBusy(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/shows/${showId}/rewatch`, {
        method: delta > 0 ? "POST" : "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`${delta > 0 ? "POST" : "DELETE"} rewatch failed: ${response.status}`);
      const wire = (await response.json()) as ShowDetailWire;
      setDetailState({ status: "ready", detail: mapShowDetail(wire) });
      onChanged?.();
    } catch {
      setDetailState({ status: "ready", detail: previous });
      setErrorMessage(delta > 0 ? "Couldn't log that rewatch. Try again." : "Couldn't undo that rewatch. Try again.");
    } finally {
      setShowActionBusy(false);
    }
  }

  async function handleDelete() {
    if (!showId) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setDeleting(true);
    setErrorMessage(null);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/shows/${showId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`DELETE failed: ${response.status}`);
      onChanged?.();
      handleClose();
    } catch {
      setErrorMessage("Couldn't delete this show. Try again.");
      setDeleting(false);
      setDeleteArmed(false);
    }
  }

  // Reopening (or opening a different show) should start from a clean slate
  // — no seasons left expanded from a previous visit, no stale error, no
  // armed delete button. Lives in the close event, not an effect watching
  // `open`, per SpotlightPalette's "derived event" pattern.
  function handleClose() {
    setExpandedSeasons(new Set());
    setErrorMessage(null);
    setDeleteArmed(false);
    setDeleting(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} ariaLabel="Show detail">
      {detailState.status === "loading" && (
        <p role="status" className="p-5 text-sm text-muted-foreground">
          Loading…
        </p>
      )}
      {detailState.status === "error" && (
        <p role="alert" className="p-5 text-sm text-destructive">
          Couldn&apos;t load this show. Try again.
        </p>
      )}
      {detailState.status === "ready" && (
        <ShowDetailBody
          detail={detailState.detail}
          expandedSeasons={expandedSeasons}
          onToggleSeason={toggleSeason}
          onToggleEpisode={handleToggleEpisode}
          onSeasonMarkAll={handleSeasonMarkAll}
          onShowMarkAll={handleShowMarkAll}
          onRewatch={handleRewatch}
          busySeasons={busySeasons}
          showActionBusy={showActionBusy}
          errorMessage={errorMessage}
          onClose={handleClose}
          deleteArmed={deleteArmed}
          deleting={deleting}
          onDelete={handleDelete}
          onCancelDelete={() => setDeleteArmed(false)}
        />
      )}
    </Modal>
  );
}

function ShowDetailBody({
  detail,
  expandedSeasons,
  onToggleSeason,
  onToggleEpisode,
  onSeasonMarkAll,
  onShowMarkAll,
  onRewatch,
  busySeasons,
  showActionBusy,
  errorMessage,
  onClose,
  deleteArmed,
  deleting,
  onDelete,
  onCancelDelete,
}: {
  detail: ShowDetail;
  expandedSeasons: Set<number>;
  onToggleSeason: (seasonNumber: number) => void;
  onToggleEpisode: (seasonNumber: number, episode: Episode) => void;
  onSeasonMarkAll: (season: Season, watched: boolean) => void;
  onShowMarkAll: (watched: boolean) => void;
  onRewatch: (delta: 1 | -1) => void;
  busySeasons: Set<number>;
  showActionBusy: boolean;
  errorMessage: string | null;
  onClose: () => void;
  deleteArmed: boolean;
  deleting: boolean;
  onDelete: () => void;
  onCancelDelete: () => void;
}) {
  const episodes = detail.seasons.flatMap((season) => season.episodes);
  const watchedCount = episodes.filter((episode) => episode.watched).length;
  const isShowFull = episodes.length > 0 && watchedCount === episodes.length;

  return (
    <div className="relative flex flex-col">
      {/* Modal-level chrome, not a content control — floats over everything rather than competing with the header's own row for space. */}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-3 right-3 z-10 bg-background/60 backdrop-blur-sm"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>

      <div data-testid="show-header" className="flex items-start gap-4 border-b border-border p-4">
        <PosterArt
          title={detail.title}
          posterUrl={detail.posterUrl}
          className="relative flex aspect-[2/3] w-20 shrink-0 items-center justify-center overflow-hidden rounded-sm text-sm font-bold text-white shadow-md"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
          <h2 className="truncate pr-8 text-lg font-extrabold">{detail.title}</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {watchedCount} of {episodes.length} watched
            {detail.rewatchCount > 0 && <span className="text-brand"> · rewatched {detail.rewatchCount}×</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" className="w-fit" onClick={() => onShowMarkAll(!isShowFull)} disabled={showActionBusy}>
              {isShowFull ? "Unmark all" : "Mark all watched"}
            </Button>
            {/* Only offered once something is watched — a rewatch bumps existing episodes and would be a silent no-op on an untouched show. */}
            {watchedCount > 0 && (
              <Button size="sm" variant="ghost" className="w-fit" onClick={() => onRewatch(1)} disabled={showActionBusy}>
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Rewatched it
              </Button>
            )}
            {detail.rewatchCount > 0 && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Undo a rewatch"
                title="Undo a rewatch"
                onClick={() => onRewatch(-1)}
                disabled={showActionBusy}
              >
                <Undo2 className="size-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {errorMessage && (
        <p role="alert" className="border-b border-border p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="max-h-[55vh] overflow-y-auto">
        {detail.seasons.map((season) => (
          <SeasonRow
            key={season.seasonNumber}
            season={season}
            expanded={expandedSeasons.has(season.seasonNumber)}
            busy={busySeasons.has(season.seasonNumber)}
            onToggle={() => onToggleSeason(season.seasonNumber)}
            onToggleEpisode={(episode) => onToggleEpisode(season.seasonNumber, episode)}
            onMarkAll={() => onSeasonMarkAll(season, true)}
            onUnmarkAll={() => onSeasonMarkAll(season, false)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border p-4">
        <p className="text-sm text-muted-foreground">This removes your watch history for this show.</p>
        <div className="flex shrink-0 items-center gap-2">
          {deleteArmed && (
            <Button size="sm" variant="ghost" onClick={onCancelDelete}>
              Cancel
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={deleting}>
            {deleteArmed ? "Confirm delete" : "Delete show"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SeasonRow({
  season,
  expanded,
  busy,
  onToggle,
  onToggleEpisode,
  onMarkAll,
  onUnmarkAll,
}: {
  season: Season;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onToggleEpisode: (episode: Episode) => void;
  onMarkAll: () => void;
  onUnmarkAll: () => void;
}) {
  const watched = season.episodes.filter((episode) => episode.watched).length;
  const isSeasonFull = season.watchState === "full";

  return (
    <div data-testid={`season-row-${season.seasonNumber}`} className="border-b border-border">
      <div
        className={cn(
          "flex items-center gap-2 bg-muted px-4 py-2",
          // Sticky only while expanded, so its episodes scroll beneath it.
          expanded && "sticky top-0 z-10",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-2 text-left text-sm"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-150", expanded && "rotate-90")}
          />
          <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", watchStateDotClass(season.watchState))} />
          <span className="font-semibold">Season {season.seasonNumber}</span>
          <span className="text-muted-foreground">
            {watched} of {season.episodes.length} watched · {watchStateLabel(season.watchState)}
          </span>
        </button>
        <Button
          size="xs"
          variant="secondary"
          onClick={isSeasonFull ? onUnmarkAll : onMarkAll}
          disabled={busy}
        >
          {isSeasonFull ? "Unmark all" : "Mark all watched"}
        </Button>
      </div>
      {expanded && (
        <ul className="flex flex-col">
          {season.episodes.map((episode) => (
            <li key={episode.id} className="flex items-center gap-3 px-4 py-2">
              <input
                type="checkbox"
                checked={episode.watched}
                onChange={() => onToggleEpisode(episode)}
                aria-label={`Season ${season.seasonNumber} episode ${episode.episodeNumber}`}
                className="size-4 shrink-0 accent-primary"
              />
              <span className="text-sm">Episode {episode.episodeNumber}</span>
              {episode.runtimeMinutes !== null && (
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">{episode.runtimeMinutes}m</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
