import type { FriendRequest, User } from '@prisma/client';
import { toUserSummaryDto, type UserSummaryDto } from './user-summary.dto';

/** One pending Friend Request, from the caller's point of view. */
export interface FriendRequestDto {
  id: string;
  /** The other User in this request — the sender if incoming, the recipient if outgoing. */
  user: UserSummaryDto;
  created_at: string;
}

export interface FriendRequestsListDto {
  incoming: FriendRequestDto[];
  outgoing: FriendRequestDto[];
}

export function toIncomingFriendRequestDto(
  request: FriendRequest & { sender: User },
): FriendRequestDto {
  return {
    id: request.id,
    user: toUserSummaryDto(request.sender),
    created_at: request.createdAt.toISOString(),
  };
}

export function toOutgoingFriendRequestDto(
  request: FriendRequest & { recipient: User },
): FriendRequestDto {
  return {
    id: request.id,
    user: toUserSummaryDto(request.recipient),
    created_at: request.createdAt.toISOString(),
  };
}
