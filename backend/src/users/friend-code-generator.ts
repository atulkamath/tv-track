import { Injectable } from '@nestjs/common';
import { generateFriendCode } from './friend-code';

/**
 * Injectable wrapper around `generateFriendCode`, so tests can force the
 * collision path that would otherwise take ~887 million draws to hit.
 */
@Injectable()
export class FriendCodeGenerator {
  next(): string {
    return generateFriendCode();
  }
}
