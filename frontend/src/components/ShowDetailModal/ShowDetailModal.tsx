"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { X } from "lucide-react";
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
  seasons: Season[];
}

function mapShowDetail(wire: ShowDetailWire): ShowDetail {
  return {
    id: wire.id,
    title: wire.title,
    posterUrl: wire.poster_path ? `${TMDB_IMAGE_BASE}${wire.poster_path}` : null,
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

/** Sets every episode across every season — used for the show mark-all optimistic tick. */
function withShowWatched(detail: ShowDetail, watched: boolean): ShowDetail {
  return {
    ...detail,
    seasons: detail.seasons.map((season) => ({ ...season, episodes: season.episodes.map((episode) => ({ ...episode, watched })) })),
  };
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
 * Show detail = centered modal (#10, docs/design.md): header with poster
 * thumb/title/watched-of-total count/show-level mark-all/close, then a body
 * of seasons collapsed by default — each with its own count, server-derived
 * `watch_state`, and mark-all, expanding inline to per-episode checkboxes.
 *
 * Scroll structure: the whole body (every season row) is one scroll
 * container (`overflow-y-auto`, capped independently of the Popup's own
 * `max-h-[84vh]` via a fixed `max-h` below, so SpotlightPalette's Popup
 * defaults — which it relies on for its own overflow — don't need to
 * change). Each season's header is `sticky top-0` *only while that season is
 * expanded*, which is what makes an expanded season's header stick while its
 * own episodes scroll past — the classic "stacking section headers" pattern,
 * not a per-season nested scroll box (793-episode shows would need 35 of
 * those, which reads worse than one shared scrollbar).
 *
 * All mutations are optimistic: flip local state immediately, then replace
 * it with the mutating endpoint's fresh `ShowDetailDto` on success, or
 * revert and show an inline `role="alert"` notice on failure — never a
 * partial, unbacked-by-the-server optimistic state left standing.
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

  return (
    <div className="flex flex-col">
      <div data-testid="show-header" className="flex items-center gap-3 border-b border-[var(--line)] p-4">
        <PosterArt
          title={detail.title}
          posterUrl={detail.posterUrl}
          className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm text-sm font-bold text-white"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate text-base font-bold">{detail.title}</h2>
          <p className="text-sm text-muted-foreground">
            {watchedCount} of {episodes.length} watched
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button size="xs" variant="secondary" onClick={() => onShowMarkAll(true)} disabled={showActionBusy}>
            Mark all watched
          </Button>
          <Button size="xs" variant="secondary" onClick={() => onShowMarkAll(false)} disabled={showActionBusy}>
            Unmark all
          </Button>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {errorMessage && (
        <p role="alert" className="border-b border-[var(--line)] p-3 text-sm text-destructive">
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

      <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] p-4">
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

  return (
    <div data-testid={`season-row-${season.seasonNumber}`} className="border-b border-[var(--line)]">
      <div
        className={cn(
          "flex items-center gap-2 bg-[var(--surface-2)] px-4 py-2",
          // Sticky only while expanded — a collapsed row is a single line
          // with nothing beneath it to scroll past, so it doesn't need to
          // stick. An expanded row sticks at the top of the shared
          // scrolling body (below) while its own episode list scrolls.
          expanded && "sticky top-0 z-10",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-2 text-left text-sm"
        >
          <span className="font-semibold">Season {season.seasonNumber}</span>
          <span className="text-muted-foreground">
            {watched} of {season.episodes.length} watched · {watchStateLabel(season.watchState)}
          </span>
        </button>
        <Button size="xs" variant="secondary" onClick={onMarkAll} disabled={busy}>
          Mark all watched
        </Button>
        <Button size="xs" variant="secondary" onClick={onUnmarkAll} disabled={busy}>
          Unmark all
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
                className="size-4 shrink-0 accent-[var(--accent-solid)]"
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
