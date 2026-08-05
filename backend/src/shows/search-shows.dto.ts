import { IsNotEmpty, IsString } from 'class-validator';
import type { TmdbShowSummary } from '../integrations/tmdb/tmdb-client';

/** Query shape for `GET /shows/search`. */
export class SearchShowsQueryDto {
  @IsString()
  @IsNotEmpty()
  q!: string;
}

/** The wire shape of one candidate. Snake-case, matching the rest of the API. */
export interface ShowSearchResultDto {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  episode_count: number;
}

export function toShowSearchResultDto(summary: TmdbShowSummary): ShowSearchResultDto {
  return {
    tmdb_id: summary.tmdbId,
    title: summary.title,
    year: summary.year,
    poster_path: summary.posterPath,
    episode_count: summary.episodeCount,
  };
}
