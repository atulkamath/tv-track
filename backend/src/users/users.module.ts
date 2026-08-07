import { Module } from '@nestjs/common';
import { CLERK_USER_DIRECTORY } from '../auth/clerk-user-directory';
import { ClerkUserDirectoryClient } from '../auth/clerk-user-directory-client';
import { ShowsModule } from '../shows/shows.module';
import { FriendCodeGenerator } from './friend-code-generator';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [ShowsModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    FriendCodeGenerator,
    { provide: CLERK_USER_DIRECTORY, useClass: ClerkUserDirectoryClient },
  ],
  exports: [UsersService],
})
export class UsersModule {}
