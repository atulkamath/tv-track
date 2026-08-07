import type { ConfigService } from '@nestjs/config';

/**
 * Reads a required config value, throwing at construction time rather than
 * per request. Both Clerk adapters (`ClerkTokenVerifier`, a
 * `ClerkUserDirectoryClient`) need this same "fail loudly at startup" check;
 * shared here so it says the same thing once instead of twice.
 */
export function requireConfigValue(config: ConfigService, key: string): string {
  const value = config.get<string>(key);
  if (!value) {
    throw new Error(`${key} is not set — the API cannot start without it.`);
  }
  return value;
}
