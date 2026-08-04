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

export interface TmdbClient {
  /** Backs `GET /shows/search` — the Spotlight palette's live suggestions. */
  searchShows(query: string): Promise<TmdbShowSummary[]>;
}

export const TMDB_CLIENT = Symbol('TMDB_CLIENT');
