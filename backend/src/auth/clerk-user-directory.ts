/**
 * A second, narrower seam onto Clerk (alongside `TokenVerifier`). A verified
 * session token only carries `sub` — Clerk's default session claims don't
 * include email unless a custom JWT template adds it — so backfilling
 * `users.email` at lazy-creation time (see `UsersService`) needs a separate
 * lookup against Clerk's user directory.
 */
export interface ClerkUserDirectory {
  /**
   * The Clerk user's primary email address. Throws if the user has none —
   * every Clerk account has at least one verified email in this app's sign-up
   * flow, so a missing one is a genuine anomaly, not a value to paper over.
   */
  getPrimaryEmail(clerkUserId: string): Promise<string>;
}

export const CLERK_USER_DIRECTORY = Symbol('CLERK_USER_DIRECTORY');
