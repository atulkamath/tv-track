import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, type ClerkClient } from '@clerk/backend';
import { requireConfigValue } from './require-config-value';
import type { ClerkUserDirectory } from './clerk-user-directory';

@Injectable()
export class ClerkUserDirectoryClient implements ClerkUserDirectory {
  private readonly clerk: ClerkClient;

  constructor(config: ConfigService) {
    const secretKey = requireConfigValue(config, 'CLERK_SECRET_KEY');
    this.clerk = createClerkClient({ secretKey });
  }

  async getPrimaryEmail(clerkUserId: string): Promise<string> {
    const user = await this.clerk.users.getUser(clerkUserId);
    const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
    const email = primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
    if (!email) {
      throw new Error(`Clerk user ${clerkUserId} has no email address.`);
    }
    return email;
  }
}
