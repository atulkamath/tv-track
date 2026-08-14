import type { TmdbShowDetail } from '../src/integrations/tmdb/tmdb-client';
import { createTestApp, type TestApp } from './app-harness';

// Season 1 = 59 + 47 = 106 minutes; season 2 = 48 + null = 48.
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
        { tmdbId: 4, episodeNumber: 2, runtimeMinutes: null },
      ],
    },
  ],
};

describe('POST /shows/:id/rewatch', () => {
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

  /** Adds the show with every season watched, returning its id. */
  async function addShowFullyWatched(): Promise<string> {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(TWO_SEASON_SHOW);
    const created = await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396 })
      .expect(201);
    return created.body.id;
  }

  async function watchTime(bearer = token): Promise<number> {
    const response = await testApp
      .request()
      .get('/me/watch-time')
      .set('Authorization', `Bearer ${bearer}`)
      .expect(200);
    return response.body.minutes;
  }

  it('doubles the Watch Time of a fully-watched show', async () => {
    const showId = await addShowFullyWatched();
    await expect(watchTime()).resolves.toBe(154);

    await testApp.request().post(`/shows/${showId}/rewatch`).set('Authorization', `Bearer ${token}`).expect(200);

    await expect(watchTime()).resolves.toBe(308);
  });

  it('accrues again on each call — it is a counter, not a flag', async () => {
    const showId = await addShowFullyWatched();

    await testApp.request().post(`/shows/${showId}/rewatch`).set('Authorization', `Bearer ${token}`).expect(200);
    const response = await testApp
      .request()
      .post(`/shows/${showId}/rewatch`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.rewatch_count).toBe(2);
    await expect(watchTime()).resolves.toBe(462);
  });

  it('leaves Watch State alone — a rewatch never marks anything watched', async () => {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(TWO_SEASON_SHOW);
    const created = await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396, seasons: [1] })
      .expect(201);
    const showId: string = created.body.id;

    const response = await testApp
      .request()
      .post(`/shows/${showId}/rewatch`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Season 2 stays untouched, so only season 1's 106 minutes double.
    expect(response.body.seasons[0].watch_state).toBe('full');
    expect(response.body.seasons[1].watch_state).toBe('none');
    await expect(watchTime()).resolves.toBe(212);
  });

  it('is a no-op on a show the caller has watched nothing of', async () => {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(TWO_SEASON_SHOW);
    const created = await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396, seasons: [] })
      .expect(201);

    const response = await testApp
      .request()
      .post(`/shows/${created.body.id}/rewatch`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.rewatch_count).toBe(0);
    await expect(watchTime()).resolves.toBe(0);
  });

  it("does not touch another user's copy of the same mirrored show", async () => {
    const showId = await addShowFullyWatched();

    const bobToken = testApp.signInAs('user_bob');
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(TWO_SEASON_SHOW);
    await testApp.request().post('/shows').set('Authorization', `Bearer ${bobToken}`).send({ tmdb_id: 1396 }).expect(201);

    await testApp.request().post(`/shows/${showId}/rewatch`).set('Authorization', `Bearer ${token}`).expect(200);

    await expect(watchTime()).resolves.toBe(308);
    await expect(watchTime(bobToken)).resolves.toBe(154);
  });

  it('surfaces the tally on the GET /shows card too', async () => {
    const showId = await addShowFullyWatched();
    await testApp.request().post(`/shows/${showId}/rewatch`).set('Authorization', `Bearer ${token}`).expect(200);

    const shows = await testApp.request().get('/shows').set('Authorization', `Bearer ${token}`).expect(200);

    expect(shows.body[0].rewatch_count).toBe(1);
    expect(shows.body[0].watch_state).toBe('full');
  });

  it('unwatching a rewatched show drops its plays with the row, resetting Watch Time to zero', async () => {
    const showId = await addShowFullyWatched();
    await testApp.request().post(`/shows/${showId}/rewatch`).set('Authorization', `Bearer ${token}`).expect(200);

    await testApp.request().delete(`/shows/${showId}`).set('Authorization', `Bearer ${token}`).expect(204);

    await expect(watchTime()).resolves.toBe(0);
  });

  it('404s for a show id that does not exist', async () => {
    await testApp
      .request()
      .post('/shows/00000000-0000-0000-0000-000000000000/rewatch')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('401s with no bearer token', async () => {
    const showId = await addShowFullyWatched();
    await testApp.request().post(`/shows/${showId}/rewatch`).expect(401);
  });

  describe('DELETE /shows/:id/rewatch', () => {
    it('takes back one rewatch, returning Watch Time to where it was', async () => {
      const showId = await addShowFullyWatched();
      await testApp.request().post(`/shows/${showId}/rewatch`).set('Authorization', `Bearer ${token}`).expect(200);
      await expect(watchTime()).resolves.toBe(308);

      const response = await testApp
        .request()
        .delete(`/shows/${showId}/rewatch`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.rewatch_count).toBe(0);
      await expect(watchTime()).resolves.toBe(154);
    });

    it('unwinds one at a time, not all at once', async () => {
      const showId = await addShowFullyWatched();
      await testApp.request().post(`/shows/${showId}/rewatch`).set('Authorization', `Bearer ${token}`).expect(200);
      await testApp.request().post(`/shows/${showId}/rewatch`).set('Authorization', `Bearer ${token}`).expect(200);

      const response = await testApp
        .request()
        .delete(`/shows/${showId}/rewatch`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.rewatch_count).toBe(1);
      await expect(watchTime()).resolves.toBe(308);
    });

    it('bottoms out at the first watch — it can never unmark the show or zero its Watch Time', async () => {
      const showId = await addShowFullyWatched();

      await testApp.request().delete(`/shows/${showId}/rewatch`).set('Authorization', `Bearer ${token}`).expect(200);
      const response = await testApp
        .request()
        .delete(`/shows/${showId}/rewatch`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.rewatch_count).toBe(0);
      expect(response.body.seasons.every((s: { watch_state: string }) => s.watch_state === 'full')).toBe(true);
      await expect(watchTime()).resolves.toBe(154);
      await expect(testApp.prisma.watchedEpisode.count({ where: { plays: { lt: 1 } } })).resolves.toBe(0);
    });

    it("does not touch another user's plays", async () => {
      const showId = await addShowFullyWatched();
      await testApp.request().post(`/shows/${showId}/rewatch`).set('Authorization', `Bearer ${token}`).expect(200);

      const bobToken = testApp.signInAs('user_bob');
      testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(TWO_SEASON_SHOW);
      await testApp.request().post('/shows').set('Authorization', `Bearer ${bobToken}`).send({ tmdb_id: 1396 }).expect(201);
      await testApp.request().post(`/shows/${showId}/rewatch`).set('Authorization', `Bearer ${bobToken}`).expect(200);

      await testApp.request().delete(`/shows/${showId}/rewatch`).set('Authorization', `Bearer ${token}`).expect(200);

      await expect(watchTime()).resolves.toBe(154);
      await expect(watchTime(bobToken)).resolves.toBe(308);
    });

    it('404s for a show id that does not exist', async () => {
      await testApp
        .request()
        .delete('/shows/00000000-0000-0000-0000-000000000000/rewatch')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('401s with no bearer token', async () => {
      const showId = await addShowFullyWatched();
      await testApp.request().delete(`/shows/${showId}/rewatch`).expect(401);
    });
  });
});
