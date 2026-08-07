import { Controller, Get } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { LeaderboardEntryDto } from './leaderboard.dto';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  async get(@CurrentUser() user: User): Promise<LeaderboardEntryDto[]> {
    return this.leaderboard.get(user);
  }
}
