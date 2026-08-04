import { Controller, Get } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { toProfileDto, type ProfileDto } from './profile.dto';

@Controller()
export class UsersController {
  @Get('me')
  me(@CurrentUser() user: User): ProfileDto {
    return toProfileDto(user);
  }
}
