import { Client } from 'pg';

/**
 * Jest runs suites in parallel workers. They share one Postgres cluster, so
 * each worker gets its own database — otherwise one suite's `resetDatabase()`
 * truncates another suite's rows mid-test, and failures show up in whichever
 * file happened to lose the race.
 *
 * Each worker database is cloned from a template that `global-setup.ts` has
 * already migrated, so no worker pays for running migrations.
 */
export const TEMPLATE_DATABASE = 'tvtrack_template';

/** Env var carrying the cluster's admin connection string to the workers. */
export const CLUSTER_URL_ENV = 'TVTRACK_CLUSTER_URL';

export function databaseUrlFor(clusterUrl: string, databaseName: string): string {
  const url = new URL(clusterUrl);
  url.pathname = `/${databaseName}`;
  url.search = '?schema=public';
  return url.toString();
}

async function withAdminClient<T>(clusterUrl: string, run: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: databaseUrlFor(clusterUrl, 'postgres') });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export async function createDatabaseFromTemplate(
  clusterUrl: string,
  databaseName: string,
): Promise<void> {
  await withAdminClient(clusterUrl, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await client.query(`CREATE DATABASE "${databaseName}" TEMPLATE "${TEMPLATE_DATABASE}"`);
  });
}

export function workerDatabaseName(): string {
  return `tvtrack_test_w${process.env.JEST_WORKER_ID ?? '1'}`;
}
