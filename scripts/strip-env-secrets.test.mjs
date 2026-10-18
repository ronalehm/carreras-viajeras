// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stripEnvSecrets } from "./strip-env-secrets.mjs";

let dir;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function writeNextEnv(content) {
  dir = await mkdtemp(path.join(tmpdir(), "next-env-"));
  const file = path.join(dir, "next-env.mjs");
  await writeFile(file, content);
  return file;
}

describe("stripEnvSecrets", () => {
  it("keeps only NEXT_PUBLIC_* values in every mode", async () => {
    const file = await writeNextEnv(
      'export const production = {"DATABASE_URL":"postgresql://u:synthetic@h/db","NEXT_PUBLIC_SITE":"x"};\n' +
        'export const development = {"NEON_AUTH_COOKIE_SECRET":"synthetic-secret"};\n' +
        "export const test = {};\n",
    );

    const removed = await stripEnvSecrets(file);
    const output = await readFile(file, "utf8");

    expect(removed).toEqual(["DATABASE_URL", "NEON_AUTH_COOKIE_SECRET"]);
    expect(output).not.toContain("synthetic");
    expect(output).toBe(
      'export const production = {"NEXT_PUBLIC_SITE":"x"};\n' +
        "export const development = {};\n" +
        "export const test = {};\n",
    );
  });

  it("fails when the OpenNext build output is missing", async () => {
    await expect(stripEnvSecrets(path.join(tmpdir(), "missing", "next-env.mjs"))).rejects.toThrow();
  });
});
