import { ConfigService } from '@nestjs/config';
import { createClerkClient } from '@clerk/backend';
import { ClerkUserDirectoryClient } from './clerk-user-directory-client';

jest.mock('@clerk/backend', () => ({ createClerkClient: jest.fn() }));

const createClerkClientMock = createClerkClient as jest.MockedFunction<typeof createClerkClient>;

/**
 * The one class the HTTP suites can't cover: they all swap `CLERK_USER_DIRECTORY`
 * for a stub, so without this the real Clerk user lookup — and how it picks an
 * email off the account — would ship untested. Clerk's SDK is mocked for the
 * same reason `ClerkTokenVerifier`'s spec mocks `verifyToken`: the alternative
 * is real keys and a network round-trip.
 */
describe('ClerkUserDirectoryClient', () => {
  const config = (values: Record<string, string>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  let getUserMock: jest.Mock;

  beforeEach(() => {
    getUserMock = jest.fn();
    createClerkClientMock.mockReturnValue({ users: { getUser: getUserMock } } as never);
  });

  it('refuses to start without a secret key, rather than failing per request', () => {
    expect(() => new ClerkUserDirectoryClient(config({}))).toThrow(/CLERK_SECRET_KEY/);
  });

  it('returns the address matching the primary email id', async () => {
    getUserMock.mockResolvedValue({
      primaryEmailAddressId: 'idn_2',
      emailAddresses: [
        { id: 'idn_1', emailAddress: 'old@example.com' },
        { id: 'idn_2', emailAddress: 'primary@example.com' },
      ],
    });
    const directory = new ClerkUserDirectoryClient(config({ CLERK_SECRET_KEY: 'sk_test_x' }));

    await expect(directory.getPrimaryEmail('user_alice')).resolves.toBe('primary@example.com');
    expect(getUserMock).toHaveBeenCalledWith('user_alice');
  });

  it('falls back to the first email address when no primary is set', async () => {
    getUserMock.mockResolvedValue({
      primaryEmailAddressId: null,
      emailAddresses: [{ id: 'idn_1', emailAddress: 'only@example.com' }],
    });
    const directory = new ClerkUserDirectoryClient(config({ CLERK_SECRET_KEY: 'sk_test_x' }));

    await expect(directory.getPrimaryEmail('user_bob')).resolves.toBe('only@example.com');
  });

  it('throws rather than silently returning no email when the account has none', async () => {
    getUserMock.mockResolvedValue({ primaryEmailAddressId: null, emailAddresses: [] });
    const directory = new ClerkUserDirectoryClient(config({ CLERK_SECRET_KEY: 'sk_test_x' }));

    await expect(directory.getPrimaryEmail('user_no_email')).rejects.toThrow(/no email address/);
  });
});
