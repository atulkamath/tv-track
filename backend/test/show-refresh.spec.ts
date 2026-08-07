import type { TmdbShowDetail } from '../src/integrations/tmdb/tmdb-client';
import { ShowRefreshService } from '../src/shows/show-refresh.service';
import { createTestApp, type TestApp } from './app-harness';

const ONE_SEASON_SHOW: TmdbShowDetail = {
  tmdbId: 1396,
  title: 'Breaking Bad',
  year: 2008,
  posterPath: '/bb.jpg',
  status: 'Returning Series',
  seasons: [
    {
      tmdbId: 3572,
      seasonNumber: 1,
      episodes: [
        { tmdbId: 1, episodeNumber: 1, runtimeMinutes: 59 },
        { tmdbId: 2, episodeNumber: 2, runtimeMinutes: 47 },
      ],
    },
  ],
};

function withNewEpisode(show: TmdbShowDetail, status = show.status): TmdbShowDetail {
  return {
    ...show,
    status,
    seasons: show.seasons.map((season) =>
      season.seasonNumber === 1
        ? { ...season, episodes: [...season.episodes, { tmdbId: 3, episodeNumber: 3, runtimeMinutes: 42 }] }
        : season,
    ),
  };
}

describe('ShowRefreshService', () => {
  let testApp: TestApp;
  let refresh: ShowRefreshService;

  beforeAll(async () => {
    testApp = await createTestApp();
    refresh = testApp.app.get(ShowRefreshService);
  });

  afterEach(async () => {
    await testApp.resetDatabase();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('inserts a new episode TMDB reports on an existing season, unwatched for everyone', async () => {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(ONE_SEASON_SHOW);
    const token = testApp.signInAs('user_alice');
    await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396 })
      .expect(201);

    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(withNewEpisode(ONE_SEASON_SHOW));
    await refresh.run();

    const season = await testApp.prisma.season.findFirstOrThrow({ where: { seasonNumber: 1 } });
    const episodes = await testApp.prisma.episode.findMany({ where: { seasonId: season.id } });
    expect(episodes).toHaveLength(3);

    const newEpisode = episodes.find((e) => e.episodeNumber === 3);
    expect(newEpisode).toBeDefined();
    const watchedRows = await testApp.prisma.watchedEpisode.findMany({ where: { episodeId: newEpisode!.id } });
    expect(watchedRows).toHaveLength(0);
  });

  it('flips a Full show to Partial purely from a growing denominator, without touching existing watched rows', async () => {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(ONE_SEASON_SHOW);
    const token = testApp.signInAs('user_alice');
    const added = await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396 })
      .expect(201);
    expect(added.body.watch_state).toBe('full');

    const watchedCountBefore = await testApp.prisma.watchedEpisode.count();

    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(withNewEpisode(ONE_SEASON_SHOW));
    await refresh.run();

    const list = await testApp.request().get('/shows').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body[0].watch_state).toBe('partial');

    const watchedCountAfter = await testApp.prisma.watchedEpisode.count();
    expect(watchedCountAfter).toBe(watchedCountBefore);
  });

  it('never calls TMDB for a show already marked Ended locally', async () => {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce({ ...ONE_SEASON_SHOW, status: 'Ended' });
    const token = testApp.signInAs('user_alice');
    await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396 })
      .expect(201);

    testApp.stubs.tmdb.getShowDetail.mockClear();
    await refresh.run();

    expect(testApp.stubs.tmdb.getShowDetail).not.toHaveBeenCalled();
  });

  it('marks a show Ended when TMDB newly reports it, inserting nothing on this pass', async () => {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(ONE_SEASON_SHOW);
    const token = testApp.signInAs('user_alice');
    await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396 })
      .expect(201);

    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(withNewEpisode(ONE_SEASON_SHOW, 'Ended'));
    await refresh.run();

    const show = await testApp.prisma.show.findUniqueOrThrow({ where: { tmdbId: 1396 } });
    expect(show.status).toBe('Ended');

    const season = await testApp.prisma.season.findFirstOrThrow({ where: { seasonNumber: 1 } });
    const episodes = await testApp.prisma.episode.findMany({ where: { seasonId: season.id } });
    expect(episodes).toHaveLength(2);
  });

  it('calls TMDB exactly once for a show shared by two different users', async () => {
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(ONE_SEASON_SHOW);
    const aliceToken = testApp.signInAs('user_alice');
    await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ tmdb_id: 1396 })
      .expect(201);

    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(ONE_SEASON_SHOW);
    const bobToken = testApp.signInAs('user_bob');
    await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ tmdb_id: 1396 })
      .expect(201);

    await expect(testApp.prisma.show.count()).resolves.toBe(1);

    testApp.stubs.tmdb.getShowDetail.mockClear();
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(ONE_SEASON_SHOW);
    await refresh.run();

    expect(testApp.stubs.tmdb.getShowDetail).toHaveBeenCalledTimes(1);
    expect(testApp.stubs.tmdb.getShowDetail).toHaveBeenCalledWith(1396);
  });
});
