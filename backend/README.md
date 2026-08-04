# tv-track backend

NestJS API (ADR 0004), Postgres via Prisma, Clerk for auth (ADR 0003). Lives
alongside `frontend/` in one repo (ADR 0005) with a fully independent dependency
tree — there is no workspace tooling, so run every command from this folder.

## Setup

```bash
npm install
cp .env.example .env      # fill in CLERK_SECRET_KEY and DATABASE_URL
npm run prisma:deploy     # apply migrations to your dev database
npm run start:dev
```

You need a Postgres for development only. Tests do **not** use it.

## Tests

```bash
npm test                  # whole suite
npm test -- test/me.spec.ts
npm run typecheck
```

`test/global-setup.ts` boots a real Postgres from the `embedded-postgres`
package — a genuine `postgres` binary downloaded as a devDependency, so there is
nothing to install and no Docker involved — and applies the real migrations to a
template database.

Jest runs suites in parallel workers, so each worker clones that template into a
database of its own (`test/database-per-worker.ts`). Without this, one suite's
`resetDatabase()` truncates another's rows mid-test and the failure surfaces in
whichever file lost the race. Migrations still run only once.

### The HTTP test seam

`test/app-harness.ts` is what every backend ticket should build on. It boots the
entire application (real routing, real guards, real database) and replaces only
what would leave the process:

```ts
const testApp = await createTestApp();

const token = testApp.signInAs('user_alice');       // stub Clerk identity
await testApp.request().get('/me')
  .set('Authorization', `Bearer ${token}`)
  .expect(200);

testApp.stubs.tmdb.searchShows.mockResolvedValue([…]);  // outbound TMDB
testApp.stubs.llm.parseShowMentions.mockResolvedValue([…]);
testApp.stubs.friendCodes.queue('ABC234');              // deterministic codes

await testApp.resetDatabase();                       // between tests
await testApp.close();                               // in afterAll
```

Tests drive the app over HTTP the way the frontend will, so nothing gets proved
against a shape the app doesn't actually have. `src/configure-app.ts` holds the
pipes and CORS setup that both `main.ts` and the harness apply, so a route's
validation rules can't hold in production while quietly not existing in tests.

## Auth

`ClerkAuthGuard` is registered globally. It verifies the bearer token and
resolves it to a row in our own `users` table, creating that row on the caller's
first authenticated request — there is no Clerk webhook. Controllers therefore
receive an existing user:

```ts
@Get()
getProfile(@CurrentUser() user: User) { … }
```

Routes that must answer without a token opt out with `@Public()` (only
`GET /health` does).

`TOKEN_VERIFIER`, `TMDB_CLIENT` and `LLM_CLIENT` are interfaces behind DI
tokens. The TMDB and LLM implementations are deliberately unimplemented
placeholders that throw — they arrive with the tickets that need them.
