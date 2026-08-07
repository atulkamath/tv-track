import type { ClerkUserDirectory } from '../src/auth/clerk-user-directory';
import type { LlmClient } from '../src/integrations/llm/llm-client';
import type { TmdbClient } from '../src/integrations/tmdb/tmdb-client';
import type { TokenVerifier } from '../src/auth/token-verifier';

/**
 * Stands in for Clerk. `signInAs` mints an opaque token bound to a Clerk
 * identity; anything else this verifier is handed is rejected, so the guard's
 * rejection path is exercised for real rather than mocked away.
 */
export class StubTokenVerifier implements TokenVerifier {
  private readonly issued = new Map<string, string>();
  private nextTokenId = 0;

  signInAs(clerkUserId: string): string {
    const token = `stub-token-${this.nextTokenId++}`;
    this.issued.set(token, clerkUserId);
    return token;
  }

  async verify(token: string): Promise<string> {
    const clerkUserId = this.issued.get(token);
    if (!clerkUserId) throw new Error(`Unknown stub token: ${token}`);
    return clerkUserId;
  }
}

/**
 * Hands out pre-set Friend Codes before falling back to the real generator,
 * so a test can stage a collision deterministically.
 */
export class StubFriendCodeGenerator {
  private readonly queued: string[] = [];

  constructor(private readonly fallback: () => string) {}

  queue(...codes: string[]): void {
    this.queued.push(...codes);
  }

  next(): string {
    return this.queued.shift() ?? this.fallback();
  }

  reset(): void {
    this.queued.length = 0;
  }
}

/**
 * Stands in for Clerk's user directory. Every Clerk id gets a deterministic
 * email unless a test overrides it — so existing tests that only care about
 * `clerkUserId` need no changes, while friend-request tests can pin an exact
 * address to look up against.
 */
export class StubClerkUserDirectory implements ClerkUserDirectory {
  private readonly overrides = new Map<string, string>();

  setEmail(clerkUserId: string, email: string): void {
    this.overrides.set(clerkUserId, email);
  }

  async getPrimaryEmail(clerkUserId: string): Promise<string> {
    return this.overrides.get(clerkUserId) ?? `${clerkUserId}@example.test`;
  }

  reset(): void {
    this.overrides.clear();
  }
}

export type StubTmdbClient = { [K in keyof TmdbClient]: jest.Mock };
export type StubLlmClient = { [K in keyof LlmClient]: jest.Mock };

export function createStubTmdbClient(): StubTmdbClient {
  return { searchShows: jest.fn().mockResolvedValue([]) };
}

export function createStubLlmClient(): StubLlmClient {
  return { parseShowMentions: jest.fn().mockResolvedValue([]) };
}
