// Exports the existing Clerk accounts as reviewable SQL for a manual backfill of profiles
// (accounts-role-requests R5). Usage: node scripts/export-clerk-accounts.mjs > accounts-backfill.sql
// Reads CLERK_SECRET_KEY from the process environment and never prints it. It does not connect
// to Neon nor write files: the person reviews the SQL and applies it by hand on the right branch.
import { pathToFileURL } from "node:url";

export const CLERK_USERS_URL = "https://api.clerk.com/v1/users";
export const PAGE_SIZE = 100;

const LOG_PREFIX = "export-clerk-accounts:";

// Fixed messages only: never the key, the response body or an account.
class ExportError extends Error {}

/** Lowercased verified primary email of a Clerk Backend API user, or null. */
export function verifiedPrimaryEmail(user) {
  const addresses = Array.isArray(user?.email_addresses) ? user.email_addresses : [];
  const primary = addresses.find((address) => address?.id === user.primary_email_address_id);
  if (primary?.verification?.status !== "verified") return null;
  if (typeof primary.email_address !== "string") return null;
  const email = primary.email_address.trim().toLowerCase();
  return email === "" ? null : email;
}

/** SQL string literal: single quotes doubled. */
export function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** One INSERT … ON CONFLICT (user_id) DO NOTHING with the verified accounts, or an SQL comment. */
export function buildBackfillSql(users) {
  const seen = new Set();
  const rows = [];
  for (const user of users) {
    const email = verifiedPrimaryEmail(user);
    if (typeof user?.id !== "string" || user.id === "" || email === null || seen.has(user.id)) continue;
    seen.add(user.id);
    rows.push(`  (${sqlLiteral(user.id)}, ${sqlLiteral(email)})`);
  }
  if (rows.length === 0) {
    return "-- No hay cuentas de Clerk con correo primario verificado: no hay nada que insertar.\n";
  }
  return (
    "INSERT INTO profiles (user_id, email) VALUES\n" +
    `${rows.join(",\n")}\n` +
    "ON CONFLICT (user_id) DO NOTHING;\n"
  );
}

/**
 * Every user of the Clerk instance, PAGE_SIZE per request, over HTTPS.
 * @param {string} secretKey
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchAllUsers(secretKey, fetchImpl = fetch) {
  const users = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let response;
    try {
      response = await fetchImpl(`${CLERK_USERS_URL}?limit=${PAGE_SIZE}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
    } catch {
      throw new ExportError("no se pudo conectar con la API de Clerk.");
    }
    if (!response.ok) throw new ExportError(`la API de Clerk respondió ${response.status}.`);
    const page = await response.json().catch(() => null);
    if (!Array.isArray(page)) throw new ExportError("respuesta inesperada de la API de Clerk.");
    users.push(...page);
    if (page.length < PAGE_SIZE) return users;
  }
}

/**
 * Writes the SQL to stdout and returns the exit code.
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   fetchImpl?: typeof fetch,
 *   stdout?: { write(text: string): unknown },
 *   stderr?: { write(text: string): unknown },
 * }} [options]
 */
export async function main({
  env = process.env,
  fetchImpl = fetch,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const secretKey = env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    stderr.write(`${LOG_PREFIX} falta CLERK_SECRET_KEY en el entorno del proceso.\n`);
    return 1;
  }
  try {
    stdout.write(buildBackfillSql(await fetchAllUsers(secretKey, fetchImpl)));
    return 0;
  } catch (error) {
    const reason = error instanceof ExportError ? error.message : "error inesperado.";
    stderr.write(`${LOG_PREFIX} ${reason}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
