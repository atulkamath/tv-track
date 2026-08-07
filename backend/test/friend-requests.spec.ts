import { createTestApp, type TestApp } from './app-harness';

async function meProfile(testApp: TestApp, token: string) {
  const response = await testApp.request().get('/me').set('Authorization', `Bearer ${token}`);
  return response.body as { id: string; friend_code: string };
}

describe('Friend Requests', () => {
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

  describe('POST /friend-requests', () => {
    it('rejects a request with no bearer token', async () => {
      await testApp.request().post('/friend-requests').send({ code: 'ABCDEF' }).expect(401);
    });

    it('creates a pending request by Friend Code, not a Friendship', async () => {
      const aliceToken = testApp.signInAs('user_alice');
      const bobToken = testApp.signInAs('user_bob');
      const alice = await meProfile(testApp, aliceToken);
      await meProfile(testApp, bobToken);

      const response = await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ code: alice.friend_code })
        .expect(201);

      expect(response.body.user).toMatchObject({ id: alice.id, friend_code: alice.friend_code });
      await expect(testApp.prisma.friendship.findMany()).resolves.toHaveLength(0);
      await expect(testApp.prisma.friendRequest.findMany()).resolves.toHaveLength(1);
    });

    it('creates a pending request by email', async () => {
      const aliceToken = testApp.signInAs('user_alice', 'alice@example.com');
      const bobToken = testApp.signInAs('user_bob');
      const alice = await meProfile(testApp, aliceToken);
      await meProfile(testApp, bobToken);

      const response = await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ email: 'alice@example.com' })
        .expect(201);

      expect(response.body.user.id).toBe(alice.id);
    });

    it('rejects a body with neither code nor email', async () => {
      const token = testApp.signInAs('user_bob');
      await meProfile(testApp, token);

      await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it('rejects a body with both code and email', async () => {
      const token = testApp.signInAs('user_bob');
      await meProfile(testApp, token);

      await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'ABCDEF', email: 'x@example.com' })
        .expect(400);
    });

    it('404s when the Friend Code resolves to nobody', async () => {
      const token = testApp.signInAs('user_bob');
      await meProfile(testApp, token);

      await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'NOBODY' })
        .expect(404);
    });

    it('rejects sending a Friend Request to yourself', async () => {
      const token = testApp.signInAs('user_alice');
      const alice = await meProfile(testApp, token);

      await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: alice.friend_code })
        .expect(400);
    });

    it('short-circuits a request to someone already a Friend, without duplicating anything', async () => {
      const aliceToken = testApp.signInAs('user_alice');
      const bobToken = testApp.signInAs('user_bob');
      const alice = await meProfile(testApp, aliceToken);
      await meProfile(testApp, bobToken);

      const sent = await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ code: alice.friend_code });
      await testApp
        .request()
        .put(`/friend-requests/${sent.body.id}/accept`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ code: alice.friend_code })
        .expect(409);

      await expect(testApp.prisma.friendship.findMany()).resolves.toHaveLength(2);
    });

    it('converges on the same pending request rather than erroring on a resend', async () => {
      const aliceToken = testApp.signInAs('user_alice');
      const bobToken = testApp.signInAs('user_bob');
      const alice = await meProfile(testApp, aliceToken);
      await meProfile(testApp, bobToken);

      const first = await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ code: alice.friend_code })
        .expect(201);
      const second = await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ code: alice.friend_code })
        .expect(201);

      expect(second.body.id).toBe(first.body.id);
      await expect(testApp.prisma.friendRequest.findMany()).resolves.toHaveLength(1);
    });
  });

  describe('GET /friend-requests', () => {
    it('separates incoming from outgoing', async () => {
      const aliceToken = testApp.signInAs('user_alice');
      const bobToken = testApp.signInAs('user_bob');
      const carolToken = testApp.signInAs('user_carol');
      const alice = await meProfile(testApp, aliceToken);
      const bob = await meProfile(testApp, bobToken);
      const carol = await meProfile(testApp, carolToken);

      // Bob -> Alice (incoming for Alice), Alice -> Carol (outgoing for Alice).
      await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ code: alice.friend_code });
      await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ code: carol.friend_code });

      const response = await testApp
        .request()
        .get('/friend-requests')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      expect(response.body.incoming).toHaveLength(1);
      expect(response.body.incoming[0].user.id).toBe(bob.id);
      expect(response.body.outgoing).toHaveLength(1);
      expect(response.body.outgoing[0].user.id).toBe(carol.id);
    });
  });

  describe('PUT /friend-requests/:id/accept', () => {
    it('creates a mutual Friendship and removes the request', async () => {
      const aliceToken = testApp.signInAs('user_alice');
      const bobToken = testApp.signInAs('user_bob');
      const alice = await meProfile(testApp, aliceToken);
      const bob = await meProfile(testApp, bobToken);

      const sent = await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ code: alice.friend_code });

      const response = await testApp
        .request()
        .put(`/friend-requests/${sent.body.id}/accept`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      expect(response.body.friend.id).toBe(bob.id);

      const friendships = await testApp.prisma.friendship.findMany();
      expect(friendships).toHaveLength(2);
      expect(friendships).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: alice.id, friendId: bob.id }),
          expect.objectContaining({ userId: bob.id, friendId: alice.id }),
        ]),
      );
      await expect(testApp.prisma.friendRequest.findMany()).resolves.toHaveLength(0);
    });

    it('404s when the caller is not the recipient', async () => {
      const aliceToken = testApp.signInAs('user_alice');
      const bobToken = testApp.signInAs('user_bob');
      const alice = await meProfile(testApp, aliceToken);
      await meProfile(testApp, bobToken);

      const sent = await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ code: alice.friend_code });

      // Bob is the sender, not the recipient — he can't accept his own request.
      await testApp
        .request()
        .put(`/friend-requests/${sent.body.id}/accept`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(404);
    });

    it('404s for an unknown request id', async () => {
      const token = testApp.signInAs('user_alice');
      await meProfile(testApp, token);

      await testApp
        .request()
        .put('/friend-requests/00000000-0000-0000-0000-000000000000/accept')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PUT /friend-requests/:id/decline', () => {
    it('discards the request with no trace and no Friendship', async () => {
      const aliceToken = testApp.signInAs('user_alice');
      const bobToken = testApp.signInAs('user_bob');
      const alice = await meProfile(testApp, aliceToken);
      await meProfile(testApp, bobToken);

      const sent = await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ code: alice.friend_code });

      await testApp
        .request()
        .put(`/friend-requests/${sent.body.id}/decline`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(204);

      await expect(testApp.prisma.friendRequest.findMany()).resolves.toHaveLength(0);
      await expect(testApp.prisma.friendship.findMany()).resolves.toHaveLength(0);
    });

    it('404s when the caller is not the recipient', async () => {
      const aliceToken = testApp.signInAs('user_alice');
      const bobToken = testApp.signInAs('user_bob');
      const alice = await meProfile(testApp, aliceToken);
      await meProfile(testApp, bobToken);

      const sent = await testApp
        .request()
        .post('/friend-requests')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ code: alice.friend_code });

      await testApp
        .request()
        .put(`/friend-requests/${sent.body.id}/decline`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(404);
    });
  });

  it('grants no Leaderboard-relevant Friendship while a request is only pending', async () => {
    const aliceToken = testApp.signInAs('user_alice');
    const bobToken = testApp.signInAs('user_bob');
    const alice = await meProfile(testApp, aliceToken);
    await meProfile(testApp, bobToken);

    await testApp
      .request()
      .post('/friend-requests')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ code: alice.friend_code });

    await expect(testApp.prisma.friendship.findMany()).resolves.toHaveLength(0);
  });
});
