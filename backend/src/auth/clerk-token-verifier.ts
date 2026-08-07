import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import { requireConfigValue } from './require-config-value';
import type { TokenVerifier } from './token-verifier';

@Injectable()
export class ClerkTokenVerifier implements TokenVerifier {
  private readonly secretKey: string;

  constructor(config: ConfigService) {
    this.secretKey = requireConfigValue(config, 'CLERK_SECRET_KEY');
  }

  async verify(token: string): Promise<string> {
    const claims = await verifyToken(token, { secretKey: this.secretKey });
    if (!claims.sub) {
      throw new Error('Clerk token carried no subject claim.');
    }
    return claims.sub;
  }
}
