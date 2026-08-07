import type { TmdbShowDetail } from '../src/integrations/tmdb/tmdb-client';
import { createTestApp, type TestApp } from './app-harness';

const TWO_SEASON_SHOW: TmdbShowDetail = {
  tmdbId: 1396,
  title: 'Breaking Bad',
  year: 2008,
  posterPath: '/bb.jpg',
  status: 'Ended',
  seasons: [
    {
      tmdbId: 3572,
      seasonNumber: 1,
      episodes: [
        { tmdbId: 1, episodeNumber: 1, runtimeMinutes: 59 },
        { tmdbId: 2, episodeNumber: 2, runtimeMinutes: 47 },
      ],
    },
    {
      tmdbId: 3573,
      seasonNumber: 2,
      episodes: [
        { tmdbId: 3, episodeNumber: 1, runtimeMinutes: 48 },
        // No published runtime yet — must not be silently treated as 0 minutes.
        { tmdbId: 4, episodeNumber: 2, runtimeMinutes: null },
      ],
    },
  ],
};

describe('POST /shows, GET /shows, GET /shows/:id, GET /me/watch-time', () => {
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
    await testApp.request().post('/shows').send({ tmdb_id: 1396 }).expect(401);
  });

  it('marks every episode of every season watched when no seasons are named', async () => {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(TWO_SEASON_SHOW);

    const response = await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396 })
      .expect(201);

    expect(response.body).toMatchObject({ title: 'Breaking Bad', watch_state: 'full' });

    const detail = await testApp
      .request()
      .get(`/shows/${response.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(detail.body.seasons).toHaveLength(2);
    for (const season of detail.body.seasons) {
      expect(season.watch_state).toBe('full');
      for (const episode of season.episodes) {
        expect(episode.watched).toBe(true);
      }
    }
  });

  it('marks only the named seasons watched, leaving the rest none', async () => {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(TWO_SEASON_SHOW);

    const response = await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396, seasons: [1] })
      .expect(201);

    expect(response.body.watch_state).toBe('partial');

    const detail = await testApp
      .request()
      .get(`/shows/${response.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const [season1, season2] = detail.body.seasons;
    expect(season1.watch_state).toBe('full');
    expect(season1.episodes.every((e: { watched: boolean }) => e.watched)).toBe(true);
    expect(season2.watch_state).toBe('none');
    expect(season2.episodes.every((e: { watched: boolean }) => !e.watched)).toBe(true);
  });

  it('keeps an unpublished runtime as null rather than defaulting it to 0', async () => {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(TWO_SEASON_SHOW);

    const created = await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396 })
      .expect(201);

    const detail = await testApp
      .request()
      .get(`/shows/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const nullRuntimeEpisode = detail.body.seasons[1].episodes[1];
    expect(nullRuntimeEpisode.runtime_minutes).toBeNull();
  });

  it('sums watch time correctly, treating an unpublished runtime as contributing nothing', async () => {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(TWO_SEASON_SHOW);

    await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396 })
      .expect(201);

    const watchTime = await testApp
      .request()
      .get('/me/watch-time')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // 59 + 47 + 48 + (null → 0) = 154, never NaN and never a silent off-by-48.
    expect(watchTime.body).toEqual({ minutes: 154 });
  });

  it('re-adding an existing show updates the same card instead of duplicating it', async () => {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValue(TWO_SEASON_SHOW);

    const first = await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396, seasons: [1] })
      .expect(201);

    const second = await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396, seasons: [2] })
      .expect(201);

    expect(second.body.id).toBe(first.body.id);
    expect(second.body.watch_state).toBe('full'); // both seasons watched now, across two calls
    await expect(testApp.prisma.show.count()).resolves.toBe(1);

    // The mirror (show/season/episode rows) is only ever fetched from TMDB once.
    expect(testApp.stubs.tmdb.getShowDetail).toHaveBeenCalledTimes(1);

    const list = await testApp
      .request()
      .get('/shows')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('derives partial state correctly for a season with some, but not all, episodes watched', async () => {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(TWO_SEASON_SHOW);

    const created = await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396, seasons: [1] })
      .expect(201);

    // #6 only ever marks whole seasons watched — a season with a mix of
    // watched/unwatched episodes can only happen once per-episode toggling
    // exists (#9). Simulate that future state directly to prove today's
    // derivation logic already handles it correctly.
    const season1 = await testApp.prisma.season.findFirstOrThrow({ where: { seasonNumber: 1 } });
    const [, secondEpisode] = await testApp.prisma.episode.findMany({
      where: { seasonId: season1.id },
      orderBy: { episodeNumber: 'asc' },
    });
    await testApp.prisma.watchedEpisode.deleteMany({ where: { episodeId: secondEpisode.id } });

    const detail = await testApp
      .request()
      .get(`/shows/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(detail.body.seasons[0].watch_state).toBe('partial');
    expect(detail.body.watch_state).toBeUndefined(); // detail DTO has no show-level watch_state field

    const card = await testApp
      .request()
      .get('/shows')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(card.body[0].watch_state).toBe('partial');
  });

  it("does not show another user's watched episodes as your own", async () => {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(TWO_SEASON_SHOW);

    await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396 })
      .expect(201);

    const bobToken = testApp.signInAs('user_bob');
    const bobShows = await testApp
      .request()
      .get('/shows')
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    expect(bobShows.body).toEqual([]);

    const bobWatchTime = await testApp
      .request()
      .get('/me/watch-time')
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);
    expect(bobWatchTime.body).toEqual({ minutes: 0 });
  });

  it('404s for a show id that does not exist', async () => {
    await testApp
      .request()
      .get('/shows/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
