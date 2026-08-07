import { IsBoolean } from 'class-validator';

/**
 * Body for `PUT /shows/:id/episodes/:episodeId` and
 * `PUT /shows/:id/seasons/:seasonNumber`. Carries the *target* state rather
 * than flipping whatever's there now — that's what makes repeating the same
 * call a true no-op (a real PUT), not a toggle in the flip-flop sense.
 */
export class ToggleWatchedDto {
  @IsBoolean()
  watched!: boolean;
}
