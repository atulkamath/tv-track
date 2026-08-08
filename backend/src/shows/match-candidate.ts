import type { TmdbShowSummary } from '../integrations/tmdb/tmdb-client';

/**
 * Strips a leading "the" before comparing, alongside case and punctuation. A
 * literal normalize would call a bare "office" query zero exact matches out
 * of twenty TMDB results — "The Office" normalizes to "theoffice", not
 * "office" — and mis-tier an obvious match as needing disambiguation.
 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
}

/**
 * Decides whether a mention is safe to resolve without asking. A single
 * candidate is always safe — there's nothing else it could be. With more than
 * one, only an exact title match is trusted, and only when exactly one
 * candidate has it: zero exact matches (a title TMDB knows by a very
 * different name, e.g. "Got" for Game of Thrones, surrounded by unrelated
 * hits) and multiple exact matches (genuine same-name collisions, e.g. The
 * Office US/UK) both mean asking is safer than guessing. A wrong auto-pick is
 * far more costly than one extra confirm tap.
 */
export function pickConfidentMatch(
  mentionTitle: string,
  candidates: TmdbShowSummary[],
): TmdbShowSummary | null {
  if (candidates.length === 1) return candidates[0];

  const target = normalizeTitle(mentionTitle);
  const exact = candidates.filter((candidate) => normalizeTitle(candidate.title) === target);
  return exact.length === 1 ? exact[0] : null;
}
