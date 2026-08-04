import type { User } from '@prisma/client';

/** The wire shape of `GET /me`. Snake-case, matching the rest of the API. */
export interface ProfileDto {
  id: string;
  friend_code: string;
}

export function toProfileDto(user: User): ProfileDto {
  return { id: user.id, friend_code: user.friendCode };
}
