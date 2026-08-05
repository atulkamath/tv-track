import type { TmdbShowSummary } from '../src/integrations/tmdb/tmdb-client';
import { createTestApp, type TestApp } from './app-harness';

const US_OFFICE: TmdbShowSummary = {
  tmdbId: 2316,
  title: 'The Office',
  year: 2005,
  posterPath: '/us.jpg',
  episodeCount: 201,
};

const UK_OFFICE: TmdbShowSummary = {
  tmdbId: 17552,
  title: 'The Office',
  year: 2001,
  posterPath: '/uk.jpg',
  episodeCount: 14,
};

describe('GET /shows/search', () => {
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
    await testApp.request().get('/shows/search').query({ q: 'the office' }).expect(401);
  });

  it('returns distinct TMDB candidates for an ambiguous title', async () => {
    testApp.stubs.tmdb.searchShows.mockResolvedValueOnce([US_OFFICE, UK_OFFICE]);

    const response = await testApp
      .request()
      .get('/shows/search')
      .query({ q: 'the office' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual([
      { tmdb_id: 2316, title: 'The Office', year: 2005, poster_path: '/us.jpg', episode_count: 201 },
      { tmdb_id: 17552, title: 'The Office', year: 2001, poster_path: '/uk.jpg', episode_count: 14 },
    ]);
    expect(testApp.stubs.tmdb.searchShows).toHaveBeenCalledWith('the office');
  });

  it('creates no rows — the response carries no per-user state', async () => {
    testApp.stubs.tmdb.searchShows.mockResolvedValueOnce([US_OFFICE]);

    await testApp
      .request()
      .get('/shows/search')
      .query({ q: 'the office' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await expect(testApp.prisma.show.findMany()).resolves.toHaveLength(0);
  });

  it('rejects a missing query rather than searching for nothing', async () => {
    await testApp
      .request()
      .get('/shows/search')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('does not re-hit TMDB for a repeat of the same query', async () => {
    // A query no other test in this file uses, since the cache lives on the
    // app-wide ShowsService singleton and outlives a single test.
    const query = 'breaking bad';
    testApp.stubs.tmdb.searchShows.mockResolvedValue([US_OFFICE]);

    await testApp
      .request()
      .get('/shows/search')
      .query({ q: query })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await testApp
      .request()
      .get('/shows/search')
      .query({ q: query })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(testApp.stubs.tmdb.searchShows).toHaveBeenCalledTimes(1);
  });
});
