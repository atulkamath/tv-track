/**
 * Formats a Watch Time total in minutes (see CONTEXT.md — the live sum of
 * watched episode runtimes) for display, per docs/design.md's copy rule:
 * numbers formatted `29d 2h` once a full day has accrued, `4h 20m` below
 * that. Minutes are dropped once days are shown — the two units together
 * are already enough precision for a leaderboard.
 */
export function formatWatchTime(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const days = Math.floor(minutes / (24 * 60));

  if (days > 0) {
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    return `${days}d ${hours}h`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
