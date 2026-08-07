import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { CLERK_USER_DIRECTORY } from '../src/auth/clerk-user-directory';
import { TOKEN_VERIFIER } from '../src/auth/token-verifier';
import { LLM_CLIENT } from '../src/integrations/llm/llm-client';
import { TMDB_CLIENT } from '../src/integrations/tmdb/tmdb-client';
import { PrismaService } from '../src/prisma/prisma.service';
import { FriendCodeGenerator } from '../src/users/friend-code-generator';
import { generateFriendCode } from '../src/users/friend-code';
import {
  CLUSTER_URL_ENV,
  createDatabaseFromTemplate,
  databaseUrlFor,
  workerDatabaseName,
} from './database-per-worker';
import {
  createStubLlmClient,
  createStubTmdbClient,
  StubClerkUserDirectory,
  StubFriendCodeGenerator,
  StubTokenVerifier,
  type StubLlmClient,
  type StubTmdbClient,
} from './stubs';

/**
 * The backend's HTTP test seam: the whole Nest app, a real Postgres, and real
 * routing — only the things that would reach outside this process (Clerk, TMDB,
 * the LLM provider) are replaced. Tests drive it the way the frontend will,
 * over HTTP, so nothing is proved against a shape the app doesn't actually have.
 */
export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  /** A supertest agent bound to the running app. */
  request(): TestAgent;
  /**
   * Mints a token the stub verifier will accept for this Clerk identity.
   * `email` pins what `ClerkUserDirectory` reports for this identity — useful
   * when a test needs to look someone up by a specific address — and
   * defaults to a deterministic per-identity value otherwise.
   */
  signInAs(clerkUserId: string, email?: string): string;
  stubs: {
    tmdb: StubTmdbClient;
    llm: StubLlmClient;
    friendCodes: StubFriendCodeGenerator;
    clerkUsers: StubClerkUserDirectory;
  };
  /** Empties every table. Call between tests to keep them independent. */
  resetDatabase(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const clusterUrl = process.env[CLUSTER_URL_ENV];
  if (!clusterUrl) {
    throw new Error(`${CLUSTER_URL_ENV} is unset — test/global-setup.ts should have provided it.`);
  }

  // A database of this worker's own, cloned from the migrated template, so
  // suites running in parallel can't truncate each other's rows.
  const databaseName = workerDatabaseName();
  await createDatabaseFromTemplate(clusterUrl, databaseName);
  process.env.DATABASE_URL = databaseUrlFor(clusterUrl, databaseName);

  const tokenVerifier = new StubTokenVerifier();
  const friendCodes = new StubFriendCodeGenerator(generateFriendCode);
  const tmdb = createStubTmdbClient();
  const llm = createStubLlmClient();
  const clerkUsers = new StubClerkUserDirectory();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TOKEN_VERIFIER)
    .useValue(tokenVerifier)
    .overrideProvider(TMDB_CLIENT)
    .useValue(tmdb)
    .overrideProvider(LLM_CLIENT)
    .useValue(llm)
    .overrideProvider(FriendCodeGenerator)
    .useValue(friendCodes)
    .overrideProvider(CLERK_USER_DIRECTORY)
    .useValue(clerkUsers)
    .compile();

  // Same pipes and CORS as production (see src/configure-app.ts) — otherwise
  // tests would prove behaviour against an app shape that never ships.
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    request: () => request(app.getHttpServer()),
    signInAs: (clerkUserId: string, email?: string) => {
      if (email) clerkUsers.setEmail(clerkUserId, email);
      return tokenVerifier.signInAs(clerkUserId);
    },
    stubs: { tmdb, llm, friendCodes, clerkUsers },
    async resetDatabase() {
      // Seasons/episodes cascade off their Show; friend requests/friendships
      // cascade off their Users.
      await prisma.show.deleteMany();
      await prisma.user.deleteMany();
      friendCodes.reset();
      clerkUsers.reset();
      tmdb.searchShows.mockClear();
      tmdb.getShowDetail.mockClear();
      llm.parseShowMentions.mockClear();
    },
    async close() {
      await app.close();
    },
  };
}
