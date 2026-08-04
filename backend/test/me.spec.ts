import { createTestApp, type TestApp } from './app-harness';

describe('GET /me', () => {
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
    await testApp.request().get('/me').expect(401);
  });

  it('rejects a request with an unrecognized token', async () => {
    await testApp
      .request()
      .get('/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });
});
