import type { TmdbShowSummary } from '../integrations/tmdb/tmdb-client';
import { pickConfidentMatch } from './match-candidate';

function summary(tmdbId: number, title: string): TmdbShowSummary {
  return { tmdbId, title, year: null, posterPath: null, episodeCount: 0 };
}

describe('pickConfidentMatch', () => {
  it('resolves a single candidate regardless of how its title compares', () => {
    const only = summary(1, 'We Got Married');

    expect(pickConfidentMatch('Got', [only])).toBe(only);
  });

  it('resolves the one exact match among several unrelated candidates', () => {
    const target = summary(2, 'Brooklyn Nine-Nine');
    const noise = [summary(3, 'Nine Perfect Strangers'), summary(4, 'The Nine')];

    expect(pickConfidentMatch('B99', [...noise, target])).toBeNull(); // "B99" itself never matches by title
    expect(pickConfidentMatch('Brooklyn Nine-Nine', [...noise, target])).toBe(target);
  });

  it('treats a bare title as matching its TMDB "The ..." form', () => {
    const officeUs = summary(2316, 'The Office');

    expect(pickConfidentMatch('office', [officeUs, summary(999, 'Office Boy')])).toBe(officeUs);
  });

  it('asks rather than guesses when the same title collides across two real candidates', () => {
    const officeUs = summary(2316, 'The Office');
    const officeUk = summary(2996, 'The Office');

    expect(pickConfidentMatch('The Office', [officeUs, officeUk])).toBeNull();
    expect(pickConfidentMatch('office', [officeUs, officeUk])).toBeNull();
  });

  it('asks rather than guessing the top hit when nothing among several candidates matches by title', () => {
    // Shaped like a real "Got" search: twenty unrelated hits, none titled "Got".
    const candidates = [summary(1, 'We Got Married'), summary(2, 'Got to Believe'), summary(3, 'Got Talent')];

    expect(pickConfidentMatch('Got', candidates)).toBeNull();
  });
});
