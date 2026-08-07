/** The wire shape of one row in `GET /leaderboard`. Snake-case, matching the rest of the API. */
export interface LeaderboardEntryDto {
  id: string;
  email: string;
  watch_time_minutes: number;
  is_self: boolean;
}
