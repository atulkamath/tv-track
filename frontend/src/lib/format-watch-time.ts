/**
 * Formats a Watch Time total in minutes (see CONTEXT.md — the live sum of
 * watched episode runtimes) for display, per docs/design.md's copy rule:
 * numbers formatted `29d 2h` once a full day has accrued, `4h 20m` below
 * that. Minutes are dropped once days are shown — the two units together
 * are already enough precision for a leaderboard.
 *
 * Past 30 days it rolls up again to `3mo+`: at that scale the trailing days
 * are noise, and the `+` says "at least this much" rather than implying a
 * precision 30-day months don't have. Exactly 30 days is `1mo` — no `+`,
 * since there is no remainder to stand for.
 */
export function formatWatchTime(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const days = Math.floor(minutes / (24 * 60));
  const months = Math.floor(days / 30);

  if (months > 0) {
    const exact = minutes === months * 30 * 24 * 60;
    return exact ? `${months}mo` : `${months}mo+`;
  }

  if (days > 0) {
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    return `${days}d ${hours}h`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
