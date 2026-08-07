/**
 * The seam to TMDB. Nothing calls it yet — it exists so the test harness can
 * stub outbound catalog lookups from the first ticket onward, rather than
 * having every later suite grow its own ad-hoc mock (see `docs/adr/0002`).
 */
export interface TmdbShowSummary {
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  episodeCount: number;
}

export interface TmdbEpisode {
  tmdbId: number;
  episodeNumber: number;
  /** Minutes. Null when TMDB hasn't published a runtime for this episode yet. */
  runtimeMinutes: number | null;
}

export interface TmdbSeason {
  tmdbId: number;
  seasonNumber: number;
  episodes: TmdbEpisode[];
}

export interface TmdbShowDetail {
  tmdbId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  /** TMDB's status string (e.g. "Ended", "Returning Series"). */
  status: string | null;
  seasons: TmdbSeason[];
}

export interface TmdbClient {
  /** Backs `GET /shows/search` — the Spotlight palette's live suggestions. */
  searchShows(query: string): Promise<TmdbShowSummary[]>;

  /** Backs `POST /shows` — the full season/episode tree to mirror locally. */
  getShowDetail(tmdbId: number): Promise<TmdbShowDetail>;
}

export const TMDB_CLIENT = Symbol('TMDB_CLIENT');
