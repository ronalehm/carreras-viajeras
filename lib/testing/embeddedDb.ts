// Test-only PostgreSQL. It has no connection URL and never reads runtime credentials.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/neon-http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export async function createEmbeddedDb() {
  const pg = new PGlite();
  const migrations = (await readdir(path.join(process.cwd(), "drizzle")))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    const statements = (
      await readFile(path.join(process.cwd(), "drizzle", file), "utf8")
    ).split("--> statement-breakpoint");
    // Enum additions in older migrations must commit before the new value can be used.
    for (const statement of statements)
      if (statement.trim()) await pg.exec(statement);
  }
  const runOptions = (options: { arrayMode?: boolean }) => ({
    rowMode: options.arrayMode ? ("array" as const) : ("object" as const),
    parsers: {
      1184: (value: string) => value,
      1114: (value: string) => value,
      1082: (value: string) => value,
    },
  });
  // Match Neon's lazy queries and transactional batches so the production Drizzle driver
  // performs all row mapping. The adapter contains no business logic or query rewriting.
  function query(
    text: string,
    params: unknown[],
    options: { arrayMode?: boolean } = {},
  ) {
    return {
      spec: { text, params, options },
      then(
        resolve: (value: unknown) => unknown,
        reject?: (error: unknown) => unknown,
      ) {
        return pg
          .query(text, params, runOptions(options))
          .then(resolve, reject);
      },
    };
  }
  const client = Object.assign(query, {
    transaction: (queries: ReturnType<typeof query>[]) =>
      pg.transaction(async (tx) => {
        const results = [];
        for (const { spec } of queries)
          results.push(
            await tx.query(spec.text, spec.params, runOptions(spec.options)),
          );
        return results;
      }),
  });
  return { pg, db: drizzle(client as never) };
}
