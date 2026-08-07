import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { FriendRequestsController } from './friend-requests.controller';
import { FriendRequestsService } from './friend-requests.service';

@Module({
  imports: [UsersModule],
  controllers: [FriendRequestsController],
  providers: [FriendRequestsService],
})
export class FriendsModule {}
