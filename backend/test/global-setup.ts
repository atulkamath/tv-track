import { execFileSync } from 'node:child_process';
import { startEmbeddedPostgres, type EmbeddedCluster } from './embedded-postgres';
import { CLUSTER_URL_ENV, TEMPLATE_DATABASE, databaseUrlFor } from './database-per-worker';

declare global {
  // eslint-disable-next-line no-var
  var __TVTRACK_CLUSTER__: EmbeddedCluster | undefined;
}

/**
 * Boots one Postgres for the whole run and migrates a template database, which
 * each worker then clones. Migrations run exactly once, and the schema under
 * test is the schema that ships.
 */
export default async function globalSetup(): Promise<void> {
  const cluster = await startEmbeddedPostgres();
  globalThis.__TVTRACK_CLUSTER__ = cluster;

  await cluster.createDatabase(TEMPLATE_DATABASE);

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrlFor(cluster.clusterUrl, TEMPLATE_DATABASE) },
    stdio: 'inherit',
  });

  process.env[CLUSTER_URL_ENV] = cluster.clusterUrl;
}
