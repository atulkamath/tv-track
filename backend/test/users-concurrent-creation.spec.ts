import type { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';
import { createTestApp, type TestApp } from './app-harness';

interface SpyableUserDelegate {
  findUnique: (args: unknown) => Promise<unknown>;
}

/**
 * Forces the exact interleaving a second, truly concurrent request would
 * produce: this service's own "does this user exist?" lookup reports nothing
 * — but only *after* a competing insert has already committed behind its
 * back — so its own insert is guaranteed to collide with the unique index on
 * `clerkUserId` instead of maybe colliding depending on scheduler luck.
 */
function letAnotherRequestWinTheRace(
  prisma: PrismaService,
  clerkUserId: string,
  friendCode: string,
): void {
  const delegate = prisma.user as unknown as SpyableUserDelegate;
  const realFindUnique = delegate.findUnique.bind(delegate);
  let calls = 0;

  jest.spyOn(delegate, 'findUnique').mockImplementation(async (args: unknown) => {
    calls += 1;
    if (calls === 1) {
      // A distinct email from the stub `ClerkUserDirectory`'s default for
      // `clerkUserId`, so this race collides on `clerk_user_id` alone —
      // exactly the constraint this test means to exercise.
      await prisma.user.create({ data: { clerkUserId, friendCode, email: `${friendCode}@winner.test` } });
      return null;
    }
    return realFindUnique(args);
  });
}

describe('UsersService.findOrCreateByClerkUserId under a genuine race', () => {
  let testApp: TestApp;
  let users: UsersService;

  beforeAll(async () => {
    testApp = await createTestApp();
    users = testApp.app.get(UsersService);
  });

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await testApp.resetDatabase();
  });

  it('returns the winning row instead of erroring when it loses the race', async () => {
    letAnotherRequestWinTheRace(testApp.prisma, 'user_racer', 'WINNER');

    const user = await users.findOrCreateByClerkUserId('user_racer');

    expect(user.friendCode).toBe('WINNER');
  });

  it('leaves exactly one row behind after losing the race', async () => {
    letAnotherRequestWinTheRace(testApp.prisma, 'user_racer', 'WINNER');

    await users.findOrCreateByClerkUserId('user_racer');

    const rows = await testApp.prisma.user.findMany({ where: { clerkUserId: 'user_racer' } });
    expect(rows).toHaveLength(1);
  });

  it('draws a new Friend Code when the first draw collides with someone else’s', async () => {
    await testApp.prisma.user.create({
      data: { clerkUserId: 'user_squatter', friendCode: 'TAKEN2', email: 'user_squatter@example.test' },
    });
    // First draw collides with the row above; second draw is free.
    testApp.stubs.friendCodes.queue('TAKEN2', 'FREEE2');

    const user = await users.findOrCreateByClerkUserId('user_newcomer');

    expect(user.friendCode).toBe('FREEE2');
  });
});
