/**
 * The seam between this app and Clerk (ADR 0003). Everything downstream of the
 * guard knows only "which Clerk identity is this?", so tests can supply their
 * own identities without Clerk keys or network access.
 */
export interface TokenVerifier {
  /**
   * Resolves the Clerk subject id for a session token, or throws if the token
   * is invalid, expired, or not ours. Never returns null — an unverifiable
   * token is an exception, not a value.
   */
  verify(token: string): Promise<string>;
}

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');
