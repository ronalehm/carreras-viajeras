import { defineConfig } from "drizzle-kit";

// Generation only: no credentials and no automatic migration/push command.
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db-schema.ts",
  out: "./drizzle",
  schemaFilter: ["public"],
  strict: true,
});
