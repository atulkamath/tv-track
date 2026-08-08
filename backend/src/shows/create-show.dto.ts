import { IsArray, IsInt, IsOptional, IsPositive } from 'class-validator';

/**
 * `POST /shows` body. `seasons` is a list of season numbers (1-indexed, e.g.
 * `[1, 2]`) to mark watched — omitted means "every season," and `[]` means
 * "mirror the show but watch nothing" (used by manual per-episode toggling).
 */
export class CreateShowDto {
  @IsInt()
  @IsPositive()
  tmdb_id!: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  seasons?: number[];
}
