// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findPublishableKeys, frontendApiOf, liveKeyProblem } from "./check-clerk-key.mjs";

// Synthetic keys: base64 of "clerk.example.com$" and "demo-1.clerk.accounts.dev$".
const LIVE = "pk_live_Y2xlcmsuZXhhbXBsZS5jb20k";
const TEST = "pk_test_ZGVtby0xLmNsZXJrLmFjY291bnRzLmRldiQ";

let dir;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("findPublishableKeys", () => {
  it("collects distinct keys from nested text files and skips other files", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "open-next-"));
    await mkdir(path.join(dir, "assets/_next"), { recursive: true });
    await writeFile(path.join(dir, "worker.js"), `const a="${LIVE}";const b="${LIVE}";`);
    await writeFile(path.join(dir, "assets/_next/page.html"), `<script data-key="${TEST}">`);
    await writeFile(path.join(dir, "assets/logo.png"), "pk_test_ignoredBinary");

    expect(await findPublishableKeys(dir)).toEqual([LIVE, TEST]);
  });
});

describe("frontendApiOf", () => {
  it("decodes the Frontend API host", () => {
    expect(frontendApiOf(LIVE)).toBe("clerk.example.com");
    expect(frontendApiOf(TEST)).toBe("demo-1.clerk.accounts.dev");
  });

  it("flags a key that does not decode to a host", () => {
    expect(frontendApiOf("pk_live_bm90LWEta2V5")).toBe("(invalid key)");
  });
});

describe("liveKeyProblem", () => {
  it("accepts live keys only", () => {
    expect(liveKeyProblem([LIVE])).toBeNull();
  });

  it("rejects any development key", () => {
    expect(liveKeyProblem([LIVE, TEST])).toContain(TEST);
  });

  it("rejects a build without any key", () => {
    expect(liveKeyProblem([])).toContain("no Clerk publishable key");
  });
});
