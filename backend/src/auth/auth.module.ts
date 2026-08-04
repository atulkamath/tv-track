import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { ClerkTokenVerifier } from './clerk-token-verifier';
import { TOKEN_VERIFIER } from './token-verifier';

@Module({
  imports: [UsersModule],
  providers: [
    { provide: TOKEN_VERIFIER, useClass: ClerkTokenVerifier },
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
  ],
  exports: [TOKEN_VERIFIER],
})
export class AuthModule {}
