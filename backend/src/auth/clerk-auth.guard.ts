import {
  CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { IS_PUBLIC_ROUTE } from './public.decorator';
import { TOKEN_VERIFIER, type TokenVerifier } from './token-verifier';

export interface AuthenticatedRequest extends Request {
  user: User;
}

/**
 * Applied globally. Verifies the Clerk token and resolves it all the way to a
 * row in our own `users` table — lazily creating it on the caller's first
 * authenticated request, since there is no Clerk webhook (see
 * `docs/mvp-scope.md`). Every route downstream can therefore treat
 * `@CurrentUser()` as an existing User, never a Clerk id it has to go look up.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
    @Inject(TOKEN_VERIFIER) private readonly tokenVerifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.header('authorization'));
    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    let clerkUserId: string;
    try {
      clerkUserId = await this.tokenVerifier.verify(token);
    } catch {
      // Deliberately opaque: why a token failed is not the caller's business.
      throw new UnauthorizedException('Invalid bearer token.');
    }

    request.user = await this.users.findOrCreateByClerkUserId(clerkUserId);
    return true;
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined;
  return token;
}
