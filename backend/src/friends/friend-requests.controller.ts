import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateFriendRequestDto } from './create-friend-request.dto';
import { toUserSummaryDto, type UserSummaryDto } from './user-summary.dto';
import type { FriendRequestDto, FriendRequestsListDto } from './friend-request.dto';
import { FriendRequestsService } from './friend-requests.service';

@Controller('friend-requests')
export class FriendRequestsController {
  constructor(private readonly friendRequests: FriendRequestsService) {}

  @Post()
  async create(
    @CurrentUser() user: User,
    @Body() body: CreateFriendRequestDto,
  ): Promise<FriendRequestDto> {
    return this.friendRequests.create(user, body);
  }

  @Get()
  async list(@CurrentUser() user: User): Promise<FriendRequestsListDto> {
    return this.friendRequests.list(user);
  }

  @Put(':id/accept')
  async accept(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ friend: UserSummaryDto }> {
    const friend = await this.friendRequests.accept(user, id);
    return { friend: toUserSummaryDto(friend) };
  }

  @Put(':id/decline')
  @HttpCode(204)
  async decline(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.friendRequests.decline(user, id);
  }
}
