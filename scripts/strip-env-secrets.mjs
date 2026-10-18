// OpenNext compiles .env* values into the Worker and uses them when a Cloudflare
// secret is missing. Keep only public values; secrets must come from Wrangler.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const NEXT_ENV_FILE = ".open-next/cloudflare/next-env.mjs";

export async function stripEnvSecrets(file = NEXT_ENV_FILE) {
  await readFile(file); // Fail loudly if the OpenNext build did not run.
  const modes = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  const removed = new Set();
  const content = Object.entries(modes)
    .map(([mode, values]) => {
      const kept = Object.fromEntries(
        Object.entries(values).filter(([key]) => {
          if (key.startsWith("NEXT_PUBLIC_")) return true;
          removed.add(key);
          return false;
        }),
      );
      return `export const ${mode} = ${JSON.stringify(kept)};\n`;
    })
    .join("");
  await writeFile(file, content);
  return [...removed].sort();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const removed = await stripEnvSecrets();
  console.log(`strip-env-secrets: removed ${removed.length} non-public key(s) from ${NEXT_ENV_FILE}`);
}
