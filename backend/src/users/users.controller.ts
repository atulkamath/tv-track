import { Controller, Get, Post } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { toProfileDto, type ProfileDto } from './profile.dto';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: User): ProfileDto {
    return toProfileDto(user);
  }

  /** Issues a new Friend Code; the old one stops resolving immediately. */
  @Post('me/friend-code/regenerate')
  async regenerateFriendCode(@CurrentUser() user: User): Promise<ProfileDto> {
    const updated = await this.users.regenerateFriendCode(user);
    return toProfileDto(updated);
  }
}
