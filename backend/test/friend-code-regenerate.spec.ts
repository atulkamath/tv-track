import { UsersService } from '../src/users/users.service';
import { createTestApp, type TestApp } from './app-harness';

describe('POST /me/friend-code/regenerate', () => {
  let testApp: TestApp;
  let users: UsersService;

  beforeAll(async () => {
    testApp = await createTestApp();
    users = testApp.app.get(UsersService);
  });

  afterEach(async () => {
    await testApp.resetDatabase();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('rejects a request with no bearer token', async () => {
    await testApp.request().post('/me/friend-code/regenerate').expect(401);
  });

  it('issues a different code and invalidates the old one immediately', async () => {
    const token = testApp.signInAs('user_alice');
    const before = await testApp.request().get('/me').set('Authorization', `Bearer ${token}`);
    const oldCode: string = before.body.friend_code;

    const response = await testApp
      .request()
      .post('/me/friend-code/regenerate')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const newCode: string = response.body.friend_code;
    expect(newCode).not.toBe(oldCode);
    expect(newCode).toMatch(/^[A-Z2-9]{6}$/);

    await expect(users.findByFriendCode(oldCode)).resolves.toBeNull();
    await expect(users.findByFriendCode(newCode)).resolves.toMatchObject({ id: response.body.id });
  });

  it('persists the new code — GET /me reflects it afterward', async () => {
    const token = testApp.signInAs('user_bob');

    const regenerated = await testApp
      .request()
      .post('/me/friend-code/regenerate')
      .set('Authorization', `Bearer ${token}`);
    const afterward = await testApp.request().get('/me').set('Authorization', `Bearer ${token}`);

    expect(afterward.body.friend_code).toBe(regenerated.body.friend_code);
  });

  it('redraws on a collision instead of failing the request', async () => {
    const token = testApp.signInAs('user_carol');
    await testApp.request().get('/me').set('Authorization', `Bearer ${token}`);

    await testApp.prisma.user.create({
      data: { clerkUserId: 'user_squatter', friendCode: 'TAKEN9', email: 'user_squatter@example.test' },
    });
    // First draw collides with the row above; second draw is free.
    testApp.stubs.friendCodes.queue('TAKEN9', 'FREEE9');

    const response = await testApp
      .request()
      .post('/me/friend-code/regenerate')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(response.body.friend_code).toBe('FREEE9');
  });
});
