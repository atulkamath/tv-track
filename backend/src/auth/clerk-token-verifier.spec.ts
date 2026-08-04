import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import { ClerkTokenVerifier } from './clerk-token-verifier';

jest.mock('@clerk/backend', () => ({ verifyToken: jest.fn() }));

const verifyTokenMock = verifyToken as jest.MockedFunction<typeof verifyToken>;

/**
 * The one class the HTTP suites can't cover: they all swap `TOKEN_VERIFIER` for
 * a stub, so without this the real Clerk call — and what happens when it fails
 * — would ship untested. Clerk's SDK is mocked because the alternative is real
 * keys and a network round-trip; what's under test is this adapter's handling
 * of what the SDK returns.
 */
describe('ClerkTokenVerifier', () => {
  const config = (values: Record<string, string>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  beforeEach(() => {
    verifyTokenMock.mockReset();
  });

  it('refuses to start without a secret key, rather than failing per request', () => {
    expect(() => new ClerkTokenVerifier(config({}))).toThrow(/CLERK_SECRET_KEY/);
  });

  it('returns the subject claim of a valid token', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'user_alice' } as never);
    const verifier = new ClerkTokenVerifier(config({ CLERK_SECRET_KEY: 'sk_test_x' }));

    await expect(verifier.verify('a-token')).resolves.toBe('user_alice');
    expect(verifyTokenMock).toHaveBeenCalledWith('a-token', { secretKey: 'sk_test_x' });
  });

  it('propagates Clerk’s rejection so the guard can turn it into a 401', async () => {
    verifyTokenMock.mockRejectedValue(new Error('token expired'));
    const verifier = new ClerkTokenVerifier(config({ CLERK_SECRET_KEY: 'sk_test_x' }));

    await expect(verifier.verify('expired')).rejects.toThrow('token expired');
  });

  it('rejects a token that verifies but carries no subject', async () => {
    verifyTokenMock.mockResolvedValue({} as never);
    const verifier = new ClerkTokenVerifier(config({ CLERK_SECRET_KEY: 'sk_test_x' }));

    await expect(verifier.verify('subjectless')).rejects.toThrow(/no subject claim/);
  });
});
