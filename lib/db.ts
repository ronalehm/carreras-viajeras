import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getEnv } from "@/lib/env";

// HTTPS only: no connection sockets or database access during import/build.
export function getDb() {
  return drizzle(neon(getEnv().DATABASE_URL));
}
