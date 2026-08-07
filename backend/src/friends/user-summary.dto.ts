import type { User } from '@prisma/client';

/** The bare minimum this app can say about a User it isn't the caller. */
export interface UserSummaryDto {
  id: string;
  friend_code: string;
  email: string;
}

export function toUserSummaryDto(user: User): UserSummaryDto {
  return { id: user.id, friend_code: user.friendCode, email: user.email };
}
