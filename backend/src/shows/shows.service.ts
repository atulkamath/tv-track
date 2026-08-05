import { Inject, Injectable } from '@nestjs/common';
import { TMDB_CLIENT, type TmdbClient, type TmdbShowSummary } from '../integrations/tmdb/tmdb-client';

/** How long an identical query is served from cache instead of hitting TMDB. */
const CACHE_TTL_MS = 30_000;

/**
 * Caps how many distinct queries are remembered at once, so a stream of
 * never-repeated typeahead keystrokes can't grow the cache forever. Eviction
 * is oldest-first (Map preserves insertion order) rather than a real LRU —
 * plenty for a typeahead's cache, not worth more machinery.
 */
const MAX_CACHE_ENTRIES = 100;

interface CacheEntry {
  expiresAt: number;
  results: TmdbShowSummary[];
}

/**
 * Backs `GET /shows/search`. A thin passthrough to TMDB — this ticket writes
 * nothing to the local mirror (see `docs/mvp-scope.md`) — with a short cache
 * so retyping or re-focusing the Spotlight palette doesn't refire the same
 * TMDB call on every keystroke.
 */
@Injectable()
export class ShowsService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(@Inject(TMDB_CLIENT) private readonly tmdb: TmdbClient) {}

  async search(query: string): Promise<TmdbShowSummary[]> {
    const key = normalize(query);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.results;
    }

    const results = await this.tmdb.searchShows(query);
    this.remember(key, results);
    return results;
  }

  private remember(key: string, results: TmdbShowSummary[]): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, results });
  }
}

function normalize(query: string): string {
  return query.trim().toLowerCase();
}
