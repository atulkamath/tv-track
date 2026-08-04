import { randomInt } from 'node:crypto';

/**
 * Uppercase letters and digits with the ambiguous glyphs removed: no 0/O and no
 * 1/I/L, so a code read off a screen and typed into a friend request can't be
 * transcribed wrong. 31 characters over 6 positions is ~887 million codes.
 */
export const FRIEND_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const FRIEND_CODE_LENGTH = 6;

/**
 * A candidate Friend Code. Uniqueness is the database's job — see
 * `UsersService`, which retries on the unique-constraint violation.
 */
export function generateFriendCode(): string {
  let code = '';
  for (let i = 0; i < FRIEND_CODE_LENGTH; i++) {
    code += FRIEND_CODE_ALPHABET[randomInt(FRIEND_CODE_ALPHABET.length)];
  }
  return code;
}
