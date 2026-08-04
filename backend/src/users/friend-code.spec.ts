import { FRIEND_CODE_ALPHABET, FRIEND_CODE_LENGTH, generateFriendCode } from './friend-code';

describe('generateFriendCode', () => {
  it('produces a 6-character code', () => {
    expect(FRIEND_CODE_LENGTH).toBe(6);
    expect(generateFriendCode()).toHaveLength(6);
  });

  it('is alphanumeric, uppercase, and excludes ambiguous characters', () => {
    expect(FRIEND_CODE_ALPHABET).toMatch(/^[A-Z2-9]+$/);
    for (const ambiguous of ['0', 'O', '1', 'I', 'L']) {
      expect(FRIEND_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it('only ever emits characters from the alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateFriendCode()).toMatch(new RegExp(`^[${FRIEND_CODE_ALPHABET}]{6}$`));
    }
  });

  it('draws widely enough that 5000 codes are almost all distinct', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 5000; i++) codes.add(generateFriendCode());
    expect(codes.size).toBeGreaterThan(4990);
  });
});
