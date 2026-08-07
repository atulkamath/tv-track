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
        { tmdbId: 4, episodeNumber: 2, runtimeMinutes: null },
      ],
    },
  ],
};

describe('PUT /shows/:id/episodes/:episodeId, PUT /shows/:id/seasons/:seasonNumber, DELETE /shows/:id', () => {
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

  /** Adds the show with no seasons watched, returning its id and episode ids grouped by season. */
  async function addShowUnwatched() {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(TWO_SEASON_SHOW);
    const created = await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396, seasons: [] })
      .expect(201);

    const showId: string = created.body.id;
    const season1 = await testApp.prisma.season.findFirstOrThrow({ where: { showId, seasonNumber: 1 } });
    const season2 = await testApp.prisma.season.findFirstOrThrow({ where: { showId, seasonNumber: 2 } });
    const season1Episodes = await testApp.prisma.episode.findMany({
      where: { seasonId: season1.id },
      orderBy: { episodeNumber: 'asc' },
    });
    const season2Episodes = await testApp.prisma.episode.findMany({
      where: { seasonId: season2.id },
      orderBy: { episodeNumber: 'asc' },
    });

    return { showId, season1Episodes, season2Episodes };
  }

  describe('episode toggle', () => {
    it('marking watched=true is idempotent — repeating it leaves exactly one WatchedEpisode row', async () => {
      const { showId, season1Episodes } = await addShowUnwatched();
      const episodeId = season1Episodes[0].id;

      await testApp
        .request()
        .put(`/shows/${showId}/episodes/${episodeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(200);
      await testApp
        .request()
        .put(`/shows/${showId}/episodes/${episodeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(200);

      await expect(testApp.prisma.watchedEpisode.count({ where: { episodeId } })).resolves.toBe(1);
    });

    it('marking watched=false when already unwatched is a no-op', async () => {
      const { showId, season1Episodes } = await addShowUnwatched();
      const episodeId = season1Episodes[0].id;

      const response = await testApp
        .request()
        .put(`/shows/${showId}/episodes/${episodeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: false })
        .expect(200);

      expect(response.body.seasons[0].episodes[0].watched).toBe(false);
      await expect(testApp.prisma.watchedEpisode.count({ where: { episodeId } })).resolves.toBe(0);
    });

    it('unwatching a previously-watched episode removes the row', async () => {
      const { showId, season1Episodes } = await addShowUnwatched();
      const episodeId = season1Episodes[0].id;

      await testApp
        .request()
        .put(`/shows/${showId}/episodes/${episodeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(200);
      const response = await testApp
        .request()
        .put(`/shows/${showId}/episodes/${episodeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: false })
        .expect(200);

      expect(response.body.seasons[0].episodes[0].watched).toBe(false);
      await expect(testApp.prisma.watchedEpisode.count({ where: { episodeId } })).resolves.toBe(0);
    });

    it('the response is the updated ShowDetailDto, and a follow-up GET reflects the change', async () => {
      const { showId, season1Episodes } = await addShowUnwatched();
      const episodeId = season1Episodes[0].id;

      const putResponse = await testApp
        .request()
        .put(`/shows/${showId}/episodes/${episodeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(200);
      expect(putResponse.body.seasons[0].episodes[0].watched).toBe(true);
      expect(putResponse.body.seasons[0].watch_state).toBe('partial');

      const getResponse = await testApp
        .request()
        .get(`/shows/${showId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(getResponse.body.seasons[0].episodes[0].watched).toBe(true);
      expect(getResponse.body.seasons[0].watch_state).toBe('partial');
    });

    it('reflects immediately in GET /me/watch-time', async () => {
      const { showId, season1Episodes } = await addShowUnwatched();
      const episodeId = season1Episodes[0].id; // 59 minutes

      await testApp
        .request()
        .put(`/shows/${showId}/episodes/${episodeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(200);

      const watchTime = await testApp
        .request()
        .get('/me/watch-time')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(watchTime.body).toEqual({ minutes: 59 });
    });

    it('404s for an episode id that does not belong to the given show id', async () => {
      const { showId, season1Episodes } = await addShowUnwatched();
      // A second, unrelated show — Season/Episode tmdb ids must differ from
      // TWO_SEASON_SHOW's since both columns are globally unique in the mirror.
      testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce({
        tmdbId: 9999,
        title: 'Better Call Saul',
        year: 2015,
        posterPath: '/bcs.jpg',
        status: 'Ended',
        seasons: [
          {
            tmdbId: 8572,
            seasonNumber: 1,
            episodes: [{ tmdbId: 801, episodeNumber: 1, runtimeMinutes: 46 }],
          },
        ],
      });
      const otherShow = await testApp
        .request()
        .post('/shows')
        .set('Authorization', `Bearer ${token}`)
        .send({ tmdb_id: 9999, seasons: [] })
        .expect(201);

      await testApp
        .request()
        .put(`/shows/${otherShow.body.id}/episodes/${season1Episodes[0].id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(404);
    });

    it('404s for a show id that does not exist', async () => {
      const { season1Episodes } = await addShowUnwatched();
      await testApp
        .request()
        .put(`/shows/00000000-0000-0000-0000-000000000000/episodes/${season1Episodes[0].id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(404);
    });

    it('401s with no bearer token', async () => {
      const { showId, season1Episodes } = await addShowUnwatched();
      await testApp
        .request()
        .put(`/shows/${showId}/episodes/${season1Episodes[0].id}`)
        .send({ watched: true })
        .expect(401);
    });
  });

  describe('season toggle', () => {
    it('marking watched=true marks every episode in that season, without touching other seasons', async () => {
      const { showId, season1Episodes, season2Episodes } = await addShowUnwatched();

      const response = await testApp
        .request()
        .put(`/shows/${showId}/seasons/1`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(200);

      expect(response.body.seasons[0].watch_state).toBe('full');
      expect(response.body.seasons[0].episodes.every((e: { watched: boolean }) => e.watched)).toBe(true);
      expect(response.body.seasons[1].watch_state).toBe('none');
      expect(response.body.seasons[1].episodes.every((e: { watched: boolean }) => !e.watched)).toBe(true);

      await expect(
        testApp.prisma.watchedEpisode.count({ where: { episodeId: { in: season1Episodes.map((e) => e.id) } } }),
      ).resolves.toBe(2);
      await expect(
        testApp.prisma.watchedEpisode.count({ where: { episodeId: { in: season2Episodes.map((e) => e.id) } } }),
      ).resolves.toBe(0);
    });

    it('repeating watched=true on an already-watched season is a no-op', async () => {
      const { showId, season1Episodes } = await addShowUnwatched();

      await testApp
        .request()
        .put(`/shows/${showId}/seasons/1`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(200);
      await testApp
        .request()
        .put(`/shows/${showId}/seasons/1`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(200);

      await expect(
        testApp.prisma.watchedEpisode.count({ where: { episodeId: { in: season1Episodes.map((e) => e.id) } } }),
      ).resolves.toBe(2);
    });

    it('marking watched=false unmarks every episode in that season, without touching other seasons', async () => {
      const { showId, season1Episodes, season2Episodes } = await addShowUnwatched();

      await testApp
        .request()
        .put(`/shows/${showId}/seasons/1`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(200);
      await testApp
        .request()
        .put(`/shows/${showId}/seasons/2`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(200);

      const response = await testApp
        .request()
        .put(`/shows/${showId}/seasons/1`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: false })
        .expect(200);

      expect(response.body.seasons[0].watch_state).toBe('none');
      expect(response.body.seasons[1].watch_state).toBe('full');
      await expect(
        testApp.prisma.watchedEpisode.count({ where: { episodeId: { in: season1Episodes.map((e) => e.id) } } }),
      ).resolves.toBe(0);
      await expect(
        testApp.prisma.watchedEpisode.count({ where: { episodeId: { in: season2Episodes.map((e) => e.id) } } }),
      ).resolves.toBe(2);
    });

    it('reflects immediately in a follow-up GET /shows/:id and GET /me/watch-time', async () => {
      const { showId } = await addShowUnwatched();

      await testApp
        .request()
        .put(`/shows/${showId}/seasons/1`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(200);

      const detail = await testApp
        .request()
        .get(`/shows/${showId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(detail.body.seasons[0].watch_state).toBe('full');

      // Season 1 = 59 + 47 = 106 minutes.
      const watchTime = await testApp
        .request()
        .get('/me/watch-time')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(watchTime.body).toEqual({ minutes: 106 });
    });

    it('404s for a season number that does not exist on the show', async () => {
      const { showId } = await addShowUnwatched();
      await testApp
        .request()
        .put(`/shows/${showId}/seasons/99`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(404);
    });

    it('404s for a show id that does not exist', async () => {
      await addShowUnwatched();
      await testApp
        .request()
        .put('/shows/00000000-0000-0000-0000-000000000000/seasons/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(404);
    });

    it('401s with no bearer token', async () => {
      const { showId } = await addShowUnwatched();
      await testApp.request().put(`/shows/${showId}/seasons/1`).send({ watched: true }).expect(401);
    });
  });

  describe('DELETE /shows/:id', () => {
    it("removes only the caller's own watched rows, leaving another user's copy and Watch Time untouched", async () => {
      const { showId } = await addShowUnwatched();
      await testApp
        .request()
        .put(`/shows/${showId}/seasons/1`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(200);

      const bobToken = testApp.signInAs('user_bob');
      testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(TWO_SEASON_SHOW);
      const bobShow = await testApp
        .request()
        .post('/shows')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ tmdb_id: 1396 })
        .expect(201);
      expect(bobShow.body.id).toBe(showId); // same mirrored show

      await testApp.request().delete(`/shows/${showId}`).set('Authorization', `Bearer ${token}`).expect(204);

      // Alice's watched rows are gone.
      const aliceWatchTime = await testApp
        .request()
        .get('/me/watch-time')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(aliceWatchTime.body).toEqual({ minutes: 0 });
      const aliceShows = await testApp
        .request()
        .get('/shows')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(aliceShows.body).toEqual([]);

      // Bob's watched rows and Watch Time are untouched.
      const bobWatchTime = await testApp
        .request()
        .get('/me/watch-time')
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);
      expect(bobWatchTime.body).toEqual({ minutes: 154 });
      const bobDetail = await testApp
        .request()
        .get(`/shows/${showId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);
      expect(bobDetail.body.seasons.every((s: { watch_state: string }) => s.watch_state === 'full')).toBe(true);
    });

    it('does not delete the underlying Show/Season/Episode mirror rows', async () => {
      const { showId } = await addShowUnwatched();
      await testApp
        .request()
        .put(`/shows/${showId}/seasons/1`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(200);

      await testApp.request().delete(`/shows/${showId}`).set('Authorization', `Bearer ${token}`).expect(204);

      await expect(testApp.prisma.show.count({ where: { id: showId } })).resolves.toBe(1);
      await expect(testApp.prisma.season.count({ where: { showId } })).resolves.toBe(2);
      await expect(testApp.prisma.episode.count({ where: { season: { showId } } })).resolves.toBe(4);
      await expect(testApp.prisma.watchedEpisode.count()).resolves.toBe(0);
    });

    it('deleting is itself idempotent from the caller-visible standpoint: a second GET 404s cleanly', async () => {
      const { showId } = await addShowUnwatched();
      await testApp
        .request()
        .put(`/shows/${showId}/seasons/1`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watched: true })
        .expect(200);

      await testApp.request().delete(`/shows/${showId}`).set('Authorization', `Bearer ${token}`).expect(204);

      // The show no longer appears on the caller's list (they've watched nothing), even
      // though the mirror row still exists and GET /shows/:id still resolves it.
      const shows = await testApp.request().get('/shows').set('Authorization', `Bearer ${token}`).expect(200);
      expect(shows.body).toEqual([]);
    });

    it('404s for a show id that does not exist', async () => {
      await testApp
        .request()
        .delete('/shows/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('401s with no bearer token', async () => {
      const { showId } = await addShowUnwatched();
      await testApp.request().delete(`/shows/${showId}`).expect(401);
    });
  });
});
