import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Client, type QueryResultRow } from "pg";

// Workers can't reuse sockets across requests, so each query opens its own
// client; Hyperdrive keeps the real pool of connections to Neon.
export async function query<T extends QueryResultRow>(
  text: string,
  values?: unknown[],
) {
  const { env } = await getCloudflareContext({ async: true });
  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString,
  });
  await client.connect();
  try {
    return await client.query<T>(text, values);
  } finally {
    await client.end();
  }
}
