import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { TmdbShowSummary } from '../integrations/tmdb/tmdb-client';
import { toShowSearchResultDto, type ShowSearchResultDto } from './search-shows.dto';
import type { ShowCardDto } from './show.dto';

/** `POST /shows/parse` body. Free text, e.g. "the wire, sopranos season 2". */
export class ParseShowsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text!: string;
}

/**
 * A mention that named more than one candidate TMDB show, or none with
 * enough confidence to auto-pick (see `pickConfidentMatch`). Nothing is
 * created for it. `seasons` carries the user's original claim through so the
 * Disambiguation Step's `POST /shows` call can apply it once a candidate is
 * chosen.
 */
export interface AmbiguousMentionDto {
  title: string;
  seasons: number[] | null;
  candidates: ShowSearchResultDto[];
}

export function toAmbiguousMentionDto(
  title: string,
  seasons: number[] | null,
  candidates: TmdbShowSummary[],
): AmbiguousMentionDto {
  return { title, seasons, candidates: candidates.map(toShowSearchResultDto) };
}

/**
 * A mention that could not be turned into a show at all — not a crash, just
 * nothing to show a card for. `no_tmdb_match`: TMDB has nothing by this name.
 * `progress_not_understood`: the LLM understood the show but not how much of
 * it was watched (see `PARSE_SYSTEM_PROMPT`'s SEASONS section) — never
 * guessed at, since a wrong guess here would silently overstate Watch Time.
 */
export interface UnmatchedMentionDto {
  title: string;
  reason: 'no_tmdb_match' | 'progress_not_understood';
}

/** The wire shape of `POST /shows/parse`'s response. */
export interface ParseShowsResultDto {
  resolved: ShowCardDto[];
  ambiguous: AmbiguousMentionDto[];
  unmatched: UnmatchedMentionDto[];
}
