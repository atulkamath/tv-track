export default async function globalTeardown(): Promise<void> {
  await globalThis.__TVTRACK_CLUSTER__?.stop();
}
