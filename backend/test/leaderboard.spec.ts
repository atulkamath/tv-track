import type { TmdbShowDetail } from '../src/integrations/tmdb/tmdb-client';
import { createTestApp, type TestApp } from './app-harness';

const SHOW: TmdbShowDetail = {
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
        { tmdbId: 1, episodeNumber: 1, runtimeMinutes: 60 },
        { tmdbId: 2, episodeNumber: 2, runtimeMinutes: 60 },
      ],
    },
  ],
};

async function meProfile(testApp: TestApp, token: string) {
  const response = await testApp.request().get('/me').set('Authorization', `Bearer ${token}`);
  return response.body as { id: string; friend_code: string };
}

/** Sends a Friend Request from `bToken` to `aToken`'s Friend Code and accepts it. */
async function becomeFriends(testApp: TestApp, aToken: string, bToken: string): Promise<void> {
  const a = await meProfile(testApp, aToken);
  await testApp
    .request()
    .post('/friend-requests')
    .set('Authorization', `Bearer ${bToken}`)
    .send({ code: a.friend_code })
    .expect(201);

  const incoming = await testApp
    .request()
    .get('/friend-requests')
    .set('Authorization', `Bearer ${aToken}`)
    .expect(200);
  const requestId = incoming.body.incoming[0].id;

  await testApp
    .request()
    .put(`/friend-requests/${requestId}/accept`)
    .set('Authorization', `Bearer ${aToken}`)
    .expect(200);
}

describe('GET /leaderboard', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    await testApp.resetDatabase();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('rejects a request with no bearer token', async () => {
    await testApp.request().get('/leaderboard').expect(401);
  });

  it('a user with no friends sees only themselves', async () => {
    const token = testApp.signInAs('user_alice');
    await meProfile(testApp, token);

    const response = await testApp
      .request()
      .get('/leaderboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ is_self: true, watch_time_minutes: 0 });
  });

  it('returns self plus accepted friends, sorted by watch time descending', async () => {
    const aliceToken = testApp.signInAs('user_alice');
    const bobToken = testApp.signInAs('user_bob', 'bob@example.test');
    await becomeFriends(testApp, aliceToken, bobToken);

    // Bob watches more than Alice.
    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(SHOW);
    await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ tmdb_id: 1396 })
      .expect(201);

    const response = await testApp
      .request()
      .get('/leaderboard')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toMatchObject({
      email: 'bob@example.test',
      watch_time_minutes: 120,
      is_self: false,
    });
    expect(response.body[1]).toMatchObject({ watch_time_minutes: 0, is_self: true });
  });

  it('does not show a pending (not yet accepted) Friend Request', async () => {
    const aliceToken = testApp.signInAs('user_alice');
    const bobToken = testApp.signInAs('user_bob');
    const alice = await meProfile(testApp, aliceToken);

    await testApp
      .request()
      .post('/friend-requests')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ code: alice.friend_code })
      .expect(201);

    const response = await testApp
      .request()
      .get('/leaderboard')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].is_self).toBe(true);
  });

  it("someone who looked the caller up, with no Friendship yet, sees nothing of the caller's", async () => {
    const aliceToken = testApp.signInAs('user_alice');
    const bobToken = testApp.signInAs('user_bob');
    const alice = await meProfile(testApp, aliceToken);

    // Bob has Alice's Friend Code (e.g. she shared it) but never sent/accepted a request.
    void alice;

    const response = await testApp
      .request()
      .get('/leaderboard')
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].is_self).toBe(true);
  });

  it('reflects a newly-ticked episode on the very next read', async () => {
    const token = testApp.signInAs('user_alice');
    await meProfile(testApp, token);

    const before = await testApp
      .request()
      .get('/leaderboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(before.body[0].watch_time_minutes).toBe(0);

    testApp.stubs.tmdb.getShowDetail.mockResolvedValueOnce(SHOW);
    await testApp
      .request()
      .post('/shows')
      .set('Authorization', `Bearer ${token}`)
      .send({ tmdb_id: 1396 })
      .expect(201);

    const after = await testApp
      .request()
      .get('/leaderboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body[0].watch_time_minutes).toBe(120);
  });
});
