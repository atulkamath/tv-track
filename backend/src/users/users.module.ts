import { Module } from '@nestjs/common';
import { CLERK_USER_DIRECTORY } from '../auth/clerk-user-directory';
import { ClerkUserDirectoryClient } from '../auth/clerk-user-directory-client';
import { FriendCodeGenerator } from './friend-code-generator';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    FriendCodeGenerator,
    { provide: CLERK_USER_DIRECTORY, useClass: ClerkUserDirectoryClient },
  ],
  exports: [UsersService],
})
export class UsersModule {}
