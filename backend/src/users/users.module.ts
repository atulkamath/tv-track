import { Module } from '@nestjs/common';
import { FriendCodeGenerator } from './friend-code-generator';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, FriendCodeGenerator],
  exports: [UsersService],
})
export class UsersModule {}
