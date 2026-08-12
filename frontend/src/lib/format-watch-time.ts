/**
 * Formats a Watch Time total in minutes (see CONTEXT.md — the live sum of
 * watched episode runtimes) for display, per docs/design.md's copy rule:
 * numbers formatted `29d 2h` once a full day has accrued, `4h 20m` below
 * that. Minutes are dropped once days are shown — the two units together
 * are already enough precision for a leaderboard.
 *
 * Past 30 days it adds a months unit and stays exact — `4mo 1d 1h`, with the
 * leftover days and hours spelled out rather than rounded away, and empty
 * units dropped (`4mo 1h`, `1mo`). Months are a flat 30 days; calendar months
 * would make the same total read differently depending on when it accrued.
 */
export function formatWatchTime(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const days = Math.floor(minutes / (24 * 60));
  const months = Math.floor(days / 30);

  if (months > 0) {
    const remainingDays = days % 30;
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    const parts = [`${months}mo`];
    if (remainingDays > 0) parts.push(`${remainingDays}d`);
    if (hours > 0) parts.push(`${hours}h`);
    return parts.join(" ");
  }

  if (days > 0) {
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    return `${days}d ${hours}h`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
