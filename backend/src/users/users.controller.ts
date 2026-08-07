import { Controller, Get, Post } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { ShowsService } from '../shows/shows.service';
import { toProfileDto, type ProfileDto } from './profile.dto';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly shows: ShowsService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: User): ProfileDto {
    return toProfileDto(user);
  }

  /** Sum of the caller's watched episode runtimes, computed live (CONTEXT.md → Watch Time). */
  @Get('me/watch-time')
  async watchTime(@CurrentUser() user: User): Promise<{ minutes: number }> {
    const minutes = await this.shows.getWatchTime(user);
    return { minutes };
  }

  /** Issues a new Friend Code; the old one stops resolving immediately. */
  @Post('me/friend-code/regenerate')
  async regenerateFriendCode(@CurrentUser() user: User): Promise<ProfileDto> {
    const updated = await this.users.regenerateFriendCode(user);
    return toProfileDto(updated);
  }
}
