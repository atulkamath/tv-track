import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { CLERK_USER_DIRECTORY, type ClerkUserDirectory } from '../auth/clerk-user-directory';
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
    @Inject(CLERK_USER_DIRECTORY) private readonly clerkUsers: ClerkUserDirectory,
  ) {}

  async findOrCreateByClerkUserId(clerkUserId: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { clerkUserId } });
    if (existing) return existing;

    const email = await this.clerkUsers.getPrimaryEmail(clerkUserId);

    try {
      return await this.withRetryOnFriendCodeCollision((friendCode) =>
        this.prisma.user.create({ data: { clerkUserId, email, friendCode } }),
      );
    } catch (error) {
      // Another request created this same user between our lookup and our
      // insert. Read back the row it just created instead of treating this
      // as a real failure.
      if (violatedField(error) === 'clerk_user_id') {
        const winner = await this.prisma.user.findUnique({ where: { clerkUserId } });
        if (winner) return winner;
      }
      throw error;
    }
  }

  /** Backs `POST /me/friend-code/regenerate` — the old code stops resolving immediately. */
  async regenerateFriendCode(user: User): Promise<User> {
    return this.withRetryOnFriendCodeCollision((friendCode) =>
      this.prisma.user.update({ where: { id: user.id }, data: { friendCode } }),
    );
  }

  async findByFriendCode(friendCode: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { friendCode } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * Draws a Friend Code and runs `save`, redrawing on a ~1-in-887M collision
   * with someone else's code rather than failing the request. Shared by
   * lazy creation and regeneration — the only difference between them is
   * which Prisma write `save` performs.
   */
  private async withRetryOnFriendCodeCollision<T>(save: (friendCode: string) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_FRIEND_CODE_ATTEMPTS; attempt++) {
      try {
        return await save(this.friendCodes.next());
      } catch (error) {
        if (violatedField(error) === 'friend_code' && attempt < MAX_FRIEND_CODE_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('Could not draw a unique Friend Code after several attempts.');
  }
}
