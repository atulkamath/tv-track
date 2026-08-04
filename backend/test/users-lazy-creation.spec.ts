import { createTestApp, type TestApp } from './app-harness';

describe('GET /me — lazy user creation', () => {
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

  it('creates a row on the first call and returns id + friend_code', async () => {
    const token = testApp.signInAs('user_alice');

    const response = await testApp
      .request()
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      id: expect.any(String),
      friend_code: expect.stringMatching(/^[A-Z2-9]{6}$/),
    });

    const rows = await testApp.prisma.user.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].clerkUserId).toBe('user_alice');
  });

  it('returns the same row on a second call, does not create another', async () => {
    const token = testApp.signInAs('user_bob');

    const first = await testApp.request().get('/me').set('Authorization', `Bearer ${token}`);
    const second = await testApp.request().get('/me').set('Authorization', `Bearer ${token}`);

    expect(second.body).toEqual(first.body);

    const rows = await testApp.prisma.user.findMany({ where: { clerkUserId: 'user_bob' } });
    expect(rows).toHaveLength(1);
  });
});
