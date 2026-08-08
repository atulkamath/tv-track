import type { TmdbShowDetail, TmdbShowSummary } from '../src/integrations/tmdb/tmdb-client';
import { createTestApp, type TestApp } from './app-harness';

/**
 * Every fixture below uses a title/tmdbId unique to its own test.
 * `ShowsService.search()` caches by query and the cache lives on the
 * app-wide `ShowsService` singleton, outliving a single test (see
 * shows-search.spec.ts's own note on this) — reusing a title another test
 * already searched for would skip the mocked `searchShows` call here, and
 * because `resetDatabase()` only `mockClear()`s (clearing call history, not
 * queued `mockResolvedValueOnce` values), that unconsumed value leaks
 * forward and desyncs a *later* test's queue instead.
 */
const BREAKING_BAD_SUMMARY: TmdbShowSummary = {
  tmdbId: 1396,
  title: 'Breaking Bad',
  year: 2008,
  posterPath: '/bb.jpg',
  episodeCount: 4,
};

const BREAKING_BAD_DETAIL: TmdbShowDetail = {
  tmdbId: 1396,
  title: 'Breaking Bad',
  year: 2008,
  posterPath: '/bb.jpg',
  status: 'Ended',
  seasons: [1, 2, 3].map((seasonNumber) => ({
    tmdbId: seasonNumber,
    seasonNumber,
    episodes: [{ tmdbId: seasonNumber * 10, episodeNumber: 1, runtimeMinutes: 47 }],
  })),
};

const WIRE_SUMMARY: TmdbShowSummary = {
  tmdbId: 1398,
  title: 'The Wire',
  year: 2002,
  posterPath: '/wire.jpg',
  episodeCount: 4,
};

const WIRE_DETAIL: TmdbShowDetail = {
  tmdbId: 1398,
  title: 'The Wire',
  year: 2002,
  posterPath: '/wire.jpg',
  status: 'Ended',
  seasons: [1, 2].map((seasonNumber) => ({
    tmdbId: seasonNumber,
    seasonNumber,
    episodes: [{ tmdbId: seasonNumber * 10, episodeNumber: 1, runtimeMinutes: 55 }],
  })),
};

const OFFICE_US: TmdbShowSummary = {
  tmdbId: 2316,
  title: 'The Office',
  year: 2005,
  posterPath: '/us.jpg',
  episodeCount: 201,
};

const OFFICE_UK: TmdbShowSummary = {
  tmdbId: 17552,
  title: 'The Office',
  year: 2001,
  posterPath: '/uk.jpg',
  episodeCount: 14,
};

const SOPRANOS_SUMMARY: TmdbShowSummary = {
  tmdbId: 1399,
  title: 'Sopranos',
  year: 1999,
  posterPath: '/sopranos.jpg',
  episodeCount: 2,
};

const SOPRANOS_DETAIL: TmdbShowDetail = {
  tmdbId: 1399,
  title: 'Sopranos',
  year: 1999,
  posterPath: '/sopranos.jpg',
  status: 'Ended',
  seasons: [1, 2].map((seasonNumber) => ({
    tmdbId: seasonNumber,
    seasonNumber,
    episodes: [{ tmdbId: seasonNumber * 10, episodeNumber: 1, runtimeMinutes: 50 }],
  })),
};

describe('POST /shows/parse', () => {
  let testApp: TestApp;
  let token: string;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(() => {
    token = testApp.signInAs('user_alice');
  });

  afterEach(async () => {
    await testApp.resetDatabase();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('rejects a request with no bearer token', async () => {
    await testApp.request().post('/shows/parse').send({ text: 'the wire' }).expect(401);
  });

  it('rejects an empty message rather than parsing nothing', async () => {
    await testApp.request().post('/shows/parse').set('Authorization', `Bearer ${token}`).send({ text: '' }).expect(400);
  });

  it('resolves and creates a single unambiguous mention, watching only the named seasons', async () => {
    testApp.stubs.llm.parseShowMentions.mockResolvedValueOnce([{ title: 'Breaking Bad', seasons: [1, 2, 3] }]);
    testApp.stubs.tmdb.searchShows.mockResolvedValueOnce([BREAKING_BAD_SUMMARY]);
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(BREAKING_BAD_DETAIL);

    const response = await testApp
      .request()
      .post('/shows/parse')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'breaking bad 3 seasons' })
      .expect(201);

    expect(testApp.stubs.llm.parseShowMentions).toHaveBeenCalledWith('breaking bad 3 seasons');
    expect(response.body.ambiguous).toEqual([]);
    expect(response.body.unmatched).toEqual([]);
    expect(response.body.resolved).toEqual([
      { id: expect.any(String), title: 'Breaking Bad', poster_path: '/bb.jpg', watch_state: 'full' },
    ]);
  });

  it('marks only the seasons named, leaving a season beyond them at none', async () => {
    testApp.stubs.llm.parseShowMentions.mockResolvedValueOnce([{ title: 'The Wire', seasons: [1] }]);
    testApp.stubs.tmdb.searchShows.mockResolvedValueOnce([WIRE_SUMMARY]);
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(WIRE_DETAIL);

    const response = await testApp
      .request()
      .post('/shows/parse')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'the wire season 1' })
      .expect(201);

    expect(response.body.resolved[0].watch_state).toBe('partial');
  });

  it('sends a mention matching more than one TMDB show to the ambiguous bucket, creating nothing', async () => {
    testApp.stubs.llm.parseShowMentions.mockResolvedValueOnce([{ title: 'The Office', seasons: null }]);
    testApp.stubs.tmdb.searchShows.mockResolvedValueOnce([OFFICE_US, OFFICE_UK]);

    const response = await testApp
      .request()
      .post('/shows/parse')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'the office' })
      .expect(201);

    expect(response.body.resolved).toEqual([]);
    expect(response.body.unmatched).toEqual([]);
    expect(response.body.ambiguous).toEqual([
      {
        title: 'The Office',
        seasons: null,
        candidates: [
          { tmdb_id: 2316, title: 'The Office', year: 2005, poster_path: '/us.jpg', episode_count: 201 },
          { tmdb_id: 17552, title: 'The Office', year: 2001, poster_path: '/uk.jpg', episode_count: 14 },
        ],
      },
    ]);
    await expect(testApp.prisma.show.count()).resolves.toBe(0);
  });

  it('reports a mention TMDB has nothing for as unmatched, without crashing the request', async () => {
    testApp.stubs.llm.parseShowMentions.mockResolvedValueOnce([{ title: 'Zzyzx Nonexistent Show', seasons: null }]);
    testApp.stubs.tmdb.searchShows.mockResolvedValueOnce([]);

    const response = await testApp
      .request()
      .post('/shows/parse')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'zzyzx nonexistent show' })
      .expect(201);

    expect(response.body.resolved).toEqual([]);
    expect(response.body.ambiguous).toEqual([]);
    expect(response.body.unmatched).toEqual([{ title: 'Zzyzx Nonexistent Show', reason: 'no_tmdb_match' }]);
  });

  it('reports progress it could not turn into season numbers as unmatched, never calling TMDB or guessing a season', async () => {
    testApp.stubs.llm.parseShowMentions.mockResolvedValueOnce([{ title: 'Mad Men', seasons: [] }]);

    const response = await testApp
      .request()
      .post('/shows/parse')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'mad men 5 episodes' })
      .expect(201);

    expect(response.body.unmatched).toEqual([{ title: 'Mad Men', reason: 'progress_not_understood' }]);
    expect(testApp.stubs.tmdb.searchShows).not.toHaveBeenCalled();
    await expect(testApp.prisma.show.count()).resolves.toBe(0);
  });

  it('resolves each mention in one sentence independently, mixing resolved, ambiguous, and unmatched outcomes', async () => {
    const severance = { tmdbId: 95396, title: 'Severance', year: 2022, posterPath: '/sv.jpg', episodeCount: 9 };
    const darkA = { tmdbId: 1, title: 'Dark', year: 2017, posterPath: '/a.jpg', episodeCount: 26 };
    const darkB = { tmdbId: 2, title: 'Dark', year: 1990, posterPath: '/b.jpg', episodeCount: 8 };

    testApp.stubs.llm.parseShowMentions.mockResolvedValueOnce([
      { title: 'Severance', seasons: null },
      { title: 'Dark', seasons: null },
      { title: 'Totally Unknown Show', seasons: null },
    ]);
    testApp.stubs.tmdb.searchShows
      .mockResolvedValueOnce([severance])
      .mockResolvedValueOnce([darkA, darkB])
      .mockResolvedValueOnce([]);
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce({
      tmdbId: 95396,
      title: 'Severance',
      year: 2022,
      posterPath: '/sv.jpg',
      status: 'Returning Series',
      seasons: [{ tmdbId: 1, seasonNumber: 1, episodes: [{ tmdbId: 1, episodeNumber: 1, runtimeMinutes: 55 }] }],
    });

    const response = await testApp
      .request()
      .post('/shows/parse')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'severance, dark, totally unknown show' })
      .expect(201);

    expect(response.body.resolved).toHaveLength(1);
    expect(response.body.resolved[0].title).toBe('Severance');
    expect(response.body.ambiguous).toHaveLength(1);
    expect(response.body.ambiguous[0].title).toBe('Dark');
    expect(response.body.unmatched).toEqual([{ title: 'Totally Unknown Show', reason: 'no_tmdb_match' }]);
  });

  it('updates the same card rather than duplicating it when a show is re-entered through parse', async () => {
    testApp.stubs.llm.parseShowMentions
      .mockResolvedValueOnce([{ title: 'Sopranos', seasons: [1] }])
      .mockResolvedValueOnce([{ title: 'Sopranos', seasons: [2] }]);
    testApp.stubs.tmdb.searchShows.mockResolvedValue([SOPRANOS_SUMMARY]);
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(SOPRANOS_DETAIL);

    const first = await testApp
      .request()
      .post('/shows/parse')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'sopranos season 1' })
      .expect(201);

    const second = await testApp
      .request()
      .post('/shows/parse')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'sopranos season 2' })
      .expect(201);

    expect(second.body.resolved[0].id).toBe(first.body.resolved[0].id);
    await expect(testApp.prisma.show.count()).resolves.toBe(1);
    expect(testApp.stubs.tmdb.getShowDetail).toHaveBeenCalledTimes(1);
  });

  it('never calls a real LLM — the injected fake is the only thing HTTP tests can reach', async () => {
    testApp.stubs.llm.parseShowMentions.mockResolvedValueOnce([]);

    await testApp
      .request()
      .post('/shows/parse')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'anything' })
      .expect(201);

    expect(testApp.stubs.llm.parseShowMentions).toHaveBeenCalledTimes(1);
  });
});
