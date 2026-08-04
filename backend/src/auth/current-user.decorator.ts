import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { AuthenticatedRequest } from './clerk-auth.guard';

/** The caller's own `users` row, resolved by `ClerkAuthGuard`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
