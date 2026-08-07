import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type FriendRequest, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import {
  toIncomingFriendRequestDto,
  toOutgoingFriendRequestDto,
  type FriendRequestDto,
  type FriendRequestsListDto,
} from './friend-request.dto';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION;
}

/**
 * `FriendRequest` rows only ever exist in a pending state (CONTEXT.md) —
 * accept turns one into a `Friendship` and deletes it, decline just deletes
 * it. Nothing here ever writes a Friendship except `accept`.
 */
@Injectable()
export class FriendRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /**
   * Looking someone up never creates a Friendship by itself (CONTEXT.md) —
   * this only ever produces a pending request, or rejects outright.
   */
  async create(sender: User, target: { code?: string; email?: string }): Promise<FriendRequestDto> {
    const recipient = await this.resolveTarget(target);

    if (recipient.id === sender.id) {
      throw new BadRequestException('You cannot send yourself a Friend Request.');
    }
    if (await this.areFriends(sender.id, recipient.id)) {
      throw new ConflictException('You are already Friends.');
    }

    try {
      const created = await this.prisma.friendRequest.create({
        data: { senderId: sender.id, recipientId: recipient.id },
        include: { recipient: true },
      });
      return toOutgoingFriendRequestDto(created);
    } catch (error) {
      // Resending the same request — including two truly concurrent sends —
      // converges on the one pending row rather than erroring, the same
      // treatment UsersService gives a Friend Code draw that collides.
      if (isUniqueConstraintViolation(error)) {
        const existing = await this.prisma.friendRequest.findUniqueOrThrow({
          where: { senderId_recipientId: { senderId: sender.id, recipientId: recipient.id } },
          include: { recipient: true },
        });
        return toOutgoingFriendRequestDto(existing);
      }
      throw error;
    }
  }

  async list(user: User): Promise<FriendRequestsListDto> {
    const [incoming, outgoing] = await Promise.all([
      this.prisma.friendRequest.findMany({
        where: { recipientId: user.id },
        include: { sender: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.friendRequest.findMany({
        where: { senderId: user.id },
        include: { recipient: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      incoming: incoming.map(toIncomingFriendRequestDto),
      outgoing: outgoing.map(toOutgoingFriendRequestDto),
    };
  }

  /** Creates the mutual Friendship and discards the request that spawned it. */
  async accept(recipient: User, requestId: string): Promise<User> {
    const request = await this.findPendingRequestForRecipient(recipient, requestId);

    return this.prisma.$transaction(async (tx) => {
      // The delete's own affected-row count is the concurrency guard: if a
      // race (a second accept, or a decline) already consumed this request
      // between the read above and here, this deletes 0 rows and we bail
      // before creating a Friendship — instead of the read-then-act gap
      // letting two concurrent calls both think the request was still theirs
      // to act on.
      const { count } = await tx.friendRequest.deleteMany({
        where: { id: request.id, recipientId: recipient.id },
      });
      if (count === 0) {
        throw new NotFoundException('No pending Friend Request found.');
      }
      // Also clears out a mirror-image pending request (the other party
      // separately friend-requested this one first) — once accepted, that
      // second request is moot rather than a stale row nobody can act on.
      await tx.friendRequest.deleteMany({
        where: { senderId: request.recipientId, recipientId: request.senderId },
      });
      await tx.friendship.createMany({
        data: [
          { userId: request.senderId, friendId: request.recipientId },
          { userId: request.recipientId, friendId: request.senderId },
        ],
        skipDuplicates: true,
      });
      return tx.user.findUniqueOrThrow({ where: { id: request.senderId } });
    });
  }

  /** Discards the request. Declining leaves no trace of it (CONTEXT.md). */
  async decline(recipient: User, requestId: string): Promise<void> {
    // Same atomic-delete guard as accept: the affected-row count from a
    // scoped delete is what actually decides whether this call gets to act,
    // rather than a separate read that a concurrent accept/decline could
    // race past.
    const { count } = await this.prisma.friendRequest.deleteMany({
      where: { id: requestId, recipientId: recipient.id },
    });
    if (count === 0) {
      throw new NotFoundException('No pending Friend Request found.');
    }
  }

  private async resolveTarget({ code, email }: { code?: string; email?: string }): Promise<User> {
    if (code && email) {
      throw new BadRequestException('Provide a Friend Code or an email, not both.');
    }
    if (!code && !email) {
      throw new BadRequestException('Provide a Friend Code or an email.');
    }

    const target = code ? await this.users.findByFriendCode(code) : await this.users.findByEmail(email!);
    if (!target) {
      throw new NotFoundException('No User found for that Friend Code or email.');
    }
    return target;
  }

  private async areFriends(userId: string, otherUserId: string): Promise<boolean> {
    const friendship = await this.prisma.friendship.findUnique({
      where: { userId_friendId: { userId, friendId: otherUserId } },
    });
    return friendship !== null;
  }

  private async findPendingRequestForRecipient(recipient: User, requestId: string): Promise<FriendRequest> {
    const request = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!request || request.recipientId !== recipient.id) {
      throw new NotFoundException('No pending Friend Request found.');
    }
    return request;
  }
}
