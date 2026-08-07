import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TmdbClient, TmdbShowDetail, TmdbShowSummary } from './tmdb-client';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

interface TmdbSearchResult {
  id: number;
  name: string;
  first_air_date: string | null;
  /**
   * A path relative to TMDB's image CDN (e.g. `/ggFHVNu6...jpg`), not a full
   * URL — matches `TmdbShowSummary.posterPath`'s name. Turning it into a
   * loadable URL means prefixing TMDB's `secure_base_url` (from
   * `GET /configuration`) plus a size segment; that's a rendering concern for
   * whichever later ticket displays the poster, not this passthrough's job.
   */
  poster_path: string | null;
}

interface TmdbSearchResponse {
  results: TmdbSearchResult[];
}

interface TmdbShowDetailsResponse {
  id: number;
  name: string;
  first_air_date: string | null;
  poster_path: string | null;
  status: string | null;
  number_of_episodes: number | null;
  seasons: { season_number: number }[];
}

interface TmdbEpisodeResponse {
  id: number;
  episode_number: number;
  runtime: number | null;
}

interface TmdbSeasonResponse {
  id: number;
  episodes: TmdbEpisodeResponse[];
}

function parseYear(firstAirDate: string | null): number | null {
  if (!firstAirDate) return null;
  const year = Number.parseInt(firstAirDate.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

/**
 * The real TMDB adapter behind `TmdbClient` (see `tmdb-client.ts`). HTTP tests
 * never construct this — they override `TMDB_CLIENT` with a fake — so this
 * class is exercised by its own unit spec with `fetch` mocked, the same split
 * `ClerkTokenVerifier` uses for the Clerk SDK.
 */
@Injectable()
export class TmdbHttpClient implements TmdbClient {
  private readonly accessToken: string;

  constructor(config: ConfigService) {
    const accessToken = config.get<string>('TMDB_ACCESS_TOKEN');
    if (!accessToken) {
      throw new Error('TMDB_ACCESS_TOKEN is not set — the API cannot search TMDB.');
    }
    this.accessToken = accessToken;
  }

  async searchShows(query: string): Promise<TmdbShowSummary[]> {
    const results = await this.getJson<TmdbSearchResponse>('/search/tv', { query });

    // TMDB's /search/tv response carries no episode count — that field only
    // exists on the per-show details endpoint — so satisfying
    // TmdbShowSummary's episodeCount contract costs one extra call per
    // candidate. ShowsService's query-level cache is what keeps this from
    // hammering TMDB on repeat searches; it does not collapse this fan-out.
    return Promise.all(
      results.results.map(async (result) => ({
        tmdbId: result.id,
        title: result.name,
        year: parseYear(result.first_air_date),
        posterPath: result.poster_path,
        episodeCount: await this.fetchEpisodeCount(result.id),
      })),
    );
  }

  private async fetchEpisodeCount(tmdbId: number): Promise<number> {
    const details = await this.getJson<TmdbShowDetailsResponse>(`/tv/${tmdbId}`);
    return details.number_of_episodes ?? 0;
  }

  async getShowDetail(tmdbId: number): Promise<TmdbShowDetail> {
    const details = await this.getJson<TmdbShowDetailsResponse>(`/tv/${tmdbId}`);

    // TMDB always includes a synthetic "Specials" season (season_number 0)
    // alongside the real, aired ones — excluded here since Watch State/Watch
    // Time are about the show's actual run, not bonus/behind-the-scenes cuts.
    const realSeasons = details.seasons.filter(({ season_number }) => season_number > 0);

    const seasons = await Promise.all(
      realSeasons.map(async ({ season_number }) => {
        const season = await this.getJson<TmdbSeasonResponse>(`/tv/${tmdbId}/season/${season_number}`);
        return {
          tmdbId: season.id,
          seasonNumber: season_number,
          episodes: season.episodes.map((episode) => ({
            tmdbId: episode.id,
            episodeNumber: episode.episode_number,
            runtimeMinutes: episode.runtime,
          })),
        };
      }),
    );

    return {
      tmdbId: details.id,
      title: details.name,
      year: parseYear(details.first_air_date),
      posterPath: details.poster_path,
      status: details.status,
      seasons,
    };
  }

  private async getJson<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${TMDB_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    // TMDB's v4 read access token, sent as a bearer token — not the older v3
    // `api_key` query param.
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`TMDB request to ${path} failed with status ${response.status}.`);
    }
    return (await response.json()) as T;
  }
}
