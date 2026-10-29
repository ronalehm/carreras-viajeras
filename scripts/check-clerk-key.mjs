// Next inlines NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY at build time, so a stray pk_test_ (local
// .env.local, a Workers Builds variable) ships a Worker that rejects every production session.
// Lists the keys found in the build output and fails a production-branch build that is not pk_live_ only.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const BUILD_DIR = ".open-next";
const TEXT_FILE = /\.(m?js|html|json|cache|rsc|body)$/;
const KEY = /pk_(?:test|live)_[A-Za-z0-9]+/g;

async function* textFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* textFiles(file);
    else if (TEXT_FILE.test(entry.name)) yield file;
  }
}

export async function findPublishableKeys(dir = BUILD_DIR) {
  const keys = new Set();
  for await (const file of textFiles(dir)) {
    for (const key of (await readFile(file, "utf8")).match(KEY) ?? []) keys.add(key);
  }
  return [...keys].sort();
}

// Public: the key encodes its Frontend API host ("<host>$" in base64).
export function frontendApiOf(key) {
  const host = Buffer.from(key.split("_")[2], "base64").toString("utf8");
  return host.endsWith("$") ? host.slice(0, -1) : "(invalid key)";
}

export function liveKeyProblem(keys) {
  if (keys.length === 0) return "no Clerk publishable key found in the build output";
  const test = keys.filter((key) => key.startsWith("pk_test_"));
  if (test.length > 0) return `development key(s) in a production build: ${test.join(", ")}`;
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const keys = await findPublishableKeys();
  for (const key of keys) console.log(`check-clerk-key: ${key} → ${frontendApiOf(key)}`);
  // Production: a Workers Builds build of main (the branch behind the wrangler routes) or
  // `npm run deploy` (--require-live), which publishes from a local checkout.
  const production = process.env.WORKERS_CI_BRANCH === "main" || process.argv.includes("--require-live");
  const problem = production ? liveKeyProblem(keys) : null;
  if (problem) {
    console.error(
      `check-clerk-key: ${problem}. Set the Workers Builds build variable ` +
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to the pk_live_ key and rebuild without cache.",
    );
    process.exit(1);
  }
}
