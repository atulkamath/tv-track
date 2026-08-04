import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import type { TokenVerifier } from './token-verifier';

@Injectable()
export class ClerkTokenVerifier implements TokenVerifier {
  private readonly secretKey: string;

  constructor(config: ConfigService) {
    const secretKey = config.get<string>('CLERK_SECRET_KEY');
    if (!secretKey) {
      throw new Error('CLERK_SECRET_KEY is not set — the API cannot verify any request.');
    }
    this.secretKey = secretKey;
  }

  async verify(token: string): Promise<string> {
    const claims = await verifyToken(token, { secretKey: this.secretKey });
    if (!claims.sub) {
      throw new Error('Clerk token carried no subject claim.');
    }
    return claims.sub;
  }
}
