import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

/**
 * A throwaway Postgres cluster backed by a real `postgres` binary — no Docker,
 * no machine-level install. Tests run against genuine SQL (constraints,
 * transactions, unique violations), which is the point: the lazy-creation race
 * in `UsersService` is only meaningful against a real unique index.
 */
export interface EmbeddedCluster {
  /** Admin connection string, pointing at the default `postgres` database. */
  clusterUrl: string;
  createDatabase(name: string): Promise<void>;
  stop(): Promise<void>;
}

interface EmbeddedPostgresInstance {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  createDatabase(name: string): Promise<void>;
}

interface EmbeddedPostgresModule {
  default: new (options: {
    databaseDir: string;
    user: string;
    password: string;
    port: number;
    persistent: boolean;
    onLog?: (message: string) => void;
  }) => EmbeddedPostgresInstance;
}

/**
 * `embedded-postgres` is pure ESM while this project compiles to CommonJS, so a
 * plain `import` would be downlevelled to a `require` that Jest's module
 * registry cannot satisfy. Building the import expression through `Function`
 * keeps it a genuine runtime `import()`.
 */
const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<EmbeddedPostgresModule>;

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

export async function startEmbeddedPostgres(): Promise<EmbeddedCluster> {
  const { default: EmbeddedPostgres } = await importEsm('embedded-postgres');

  const databaseDir = mkdtempSync(join(tmpdir(), 'tvtrack-pg-'));
  const port = await findFreePort();

  const postgres = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    // Postgres' own startup chatter is noise in test output.
    onLog: () => {},
  });

  await postgres.initialise();
  await postgres.start();

  return {
    clusterUrl: `postgresql://postgres:postgres@localhost:${port}/postgres`,
    createDatabase: (name: string) => postgres.createDatabase(name),
    async stop() {
      await postgres.stop();
      rmSync(databaseDir, { recursive: true, force: true });
    },
  };
}
