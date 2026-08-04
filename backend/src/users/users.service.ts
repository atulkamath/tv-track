import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FriendCodeGenerator } from './friend-code-generator';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const MAX_FRIEND_CODE_ATTEMPTS = 5;

function violatedField(error: unknown): string | undefined {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  ) {
    return (error.meta?.target as string[] | undefined)?.[0];
  }
  return undefined;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friendCodes: FriendCodeGenerator,
  ) {}

  async findOrCreateByClerkUserId(clerkUserId: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { clerkUserId } });
    if (existing) return existing;

    for (let attempt = 1; attempt <= MAX_FRIEND_CODE_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.user.create({
          data: { clerkUserId, friendCode: this.friendCodes.next() },
        });
      } catch (error) {
        const field = violatedField(error);

        // Another request created this same user between our lookup and our
        // insert. Read back the row it just created instead of treating this
        // as a real failure.
        if (field === 'clerk_user_id') {
          const winner = await this.prisma.user.findUnique({ where: { clerkUserId } });
          if (winner) return winner;
        }

        // Our drawn Friend Code collided with someone else's (~1-in-887M).
        // Draw again rather than fail the request.
        if (field === 'friend_code' && attempt < MAX_FRIEND_CODE_ATTEMPTS) {
          continue;
        }

        throw error;
      }
    }

    throw new Error('Could not draw a unique Friend Code after several attempts.');
  }
}
