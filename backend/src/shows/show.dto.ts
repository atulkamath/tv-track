/** Full/Partial/None, per CONTEXT.md → Watch State. Always derived, never stored. */
export type WatchState = 'full' | 'partial' | 'none';

export function deriveWatchState(watchedCount: number, totalCount: number): WatchState {
  if (watchedCount === 0) return 'none';
  if (watchedCount === totalCount) return 'full';
  return 'partial';
}

interface EpisodeTree {
  id: string;
  episodeNumber: number;
  runtimeMinutes: number | null;
  /** The caller's own `WatchedEpisode` row for this episode, if any (0 or 1, never more). */
  watchedBy: { plays: number }[];
}

interface SeasonTree {
  seasonNumber: number;
  episodes: EpisodeTree[];
}

/** The shape both `ShowCardDto` and `ShowDetailDto` are built from. */
export interface ShowTree {
  id: string;
  title: string;
  posterPath: string | null;
  seasons: SeasonTree[];
}

function countWatched(episodes: EpisodeTree[]): number {
  return episodes.filter((episode) => episode.watchedBy.length > 0).length;
}

/**
 * How many extra times through the show, from the most-played Episode. Max
 * rather than min so an Episode that Show Refresh added after a Rewatch — one
 * that can only ever sit at 1 play — doesn't silently erase the badge.
 */
function countRewatches(episodes: EpisodeTree[]): number {
  return Math.max(0, ...episodes.map((episode) => (episode.watchedBy[0]?.plays ?? 0) - 1));
}

function watchStateFromEpisodes(episodes: EpisodeTree[]): WatchState {
  return deriveWatchState(countWatched(episodes), episodes.length);
}

/**
 * The wire shape of one card in `GET /shows`. Snake-case, matching the rest
 * of the API. `watched_count`/`episode_count` let the poster wall compute an
 * exact Partial percentage from this response alone — see #19: before these
 * two fields existed, a Partial card required a follow-up `GET /shows/:id`
 * per show just to count episodes, an N+1 the wall paid on every load.
 */
export interface ShowCardDto {
  id: string;
  title: string;
  poster_path: string | null;
  watch_state: WatchState;
  watched_count: number;
  episode_count: number;
  /** Extra times through, past the first. 0 for a show never rewatched. */
  rewatch_count: number;
}

export function toShowCardDto(show: ShowTree): ShowCardDto {
  const episodes = show.seasons.flatMap((season) => season.episodes);
  const watchedCount = countWatched(episodes);
  return {
    id: show.id,
    title: show.title,
    poster_path: show.posterPath,
    watch_state: deriveWatchState(watchedCount, episodes.length),
    watched_count: watchedCount,
    episode_count: episodes.length,
    rewatch_count: countRewatches(episodes),
  };
}

/** Just the identity columns a card needs — no season/episode tree. */
export interface ShowIdentity {
  id: string;
  title: string;
  posterPath: string | null;
}

/** Per-show tallies from the aggregate in `ShowsService.countEpisodesForShows`. */
export interface ShowCounts {
  episodeCount: number;
  watchedCount: number;
  /** Highest `plays` across the caller's watched Episodes; 0 if they've watched none. */
  maxPlays: number;
}

/**
 * The card built from aggregate counts instead of a hydrated tree. Same output
 * as `toShowCardDto`, without pulling every Episode row across the wire to
 * count them — the whole point of the `GROUP BY` behind `GET /shows`.
 */
export function toShowCardDtoFromCounts(show: ShowIdentity, counts: ShowCounts | undefined): ShowCardDto {
  const { episodeCount = 0, watchedCount = 0, maxPlays = 0 } = counts ?? {};
  return {
    id: show.id,
    title: show.title,
    poster_path: show.posterPath,
    watch_state: deriveWatchState(watchedCount, episodeCount),
    watched_count: watchedCount,
    episode_count: episodeCount,
    rewatch_count: Math.max(0, maxPlays - 1),
  };
}

export interface EpisodeDetailDto {
  id: string;
  episode_number: number;
  runtime_minutes: number | null;
  watched: boolean;
}

export interface SeasonDetailDto {
  season_number: number;
  watch_state: WatchState;
  episodes: EpisodeDetailDto[];
}

/** The wire shape of `GET /shows/:id`. Snake-case, matching the rest of the API. */
export interface ShowDetailDto {
  id: string;
  title: string;
  poster_path: string | null;
  /** Extra times through, past the first. 0 for a show never rewatched. */
  rewatch_count: number;
  seasons: SeasonDetailDto[];
}

export function toShowDetailDto(show: ShowTree): ShowDetailDto {
  return {
    id: show.id,
    title: show.title,
    poster_path: show.posterPath,
    rewatch_count: countRewatches(show.seasons.flatMap((season) => season.episodes)),
    seasons: show.seasons.map((season) => ({
      season_number: season.seasonNumber,
      watch_state: watchStateFromEpisodes(season.episodes),
      episodes: season.episodes.map((episode) => ({
        id: episode.id,
        episode_number: episode.episodeNumber,
        runtime_minutes: episode.runtimeMinutes,
        watched: episode.watchedBy.length > 0,
      })),
    })),
  };
}
