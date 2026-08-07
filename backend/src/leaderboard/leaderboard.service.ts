import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShowsService } from '../shows/shows.service';
import type { LeaderboardEntryDto } from './leaderboard.dto';

/**
 * Backs `GET /leaderboard`. Reuses `ShowsService.getWatchTime` per person
 * rather than a separate aggregate query — same "sum live, never stored"
 * rule (CONTEXT.md → Watch Time) applied to more than just the caller.
 */
@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shows: ShowsService,
  ) {}

  async get(user: User): Promise<LeaderboardEntryDto[]> {
    // Friendship stores one row per direction (schema.prisma), so this is
    // already exactly "my accepted Friends" with no self-join needed.
    const friendships = await this.prisma.friendship.findMany({
      where: { userId: user.id },
      include: { friend: true },
    });
    const people = [user, ...friendships.map((f) => f.friend)];

    const entries = await Promise.all(
      people.map(async (person) => ({
        id: person.id,
        email: person.email,
        watch_time_minutes: await this.shows.getWatchTime(person),
        is_self: person.id === user.id,
      })),
    );

    return entries.sort((a, b) => b.watch_time_minutes - a.watch_time_minutes);
  }
}
