// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { deriveIdempotencyKey, hashSubmission } from "./leadKeys";

describe("deriveIdempotencyKey", () => {
  it("always returns the same valid UUID (version 8, RFC 9562 variant) for the same record", async () => {
    const first = await deriveIdempotencyKey("import", "mml-2026:17");
    const second = await deriveIdempotencyKey("import", "mml-2026:17");

    expect(first).toBe(second);
    expect(z.uuid().safeParse(first).success).toBe(true);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("depends on the source and on the external id", async () => {
    const imported = await deriveIdempotencyKey("import", "mml-2026:17");

    expect(await deriveIdempotencyKey("google_form", "mml-2026:17")).not.toBe(imported);
    expect(await deriveIdempotencyKey("import", "mml-2026:18")).not.toBe(imported);
  });
});

describe("hashSubmission", () => {
  const fields = ["Ana Pérez", "+51938127170", "ana@example.com", "maraton-santiago-2027", null];

  it("returns 64 hexadecimal characters, stable for the same data", async () => {
    const hash = await hashSubmission(fields);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashSubmission([...fields])).toBe(hash);
  });

  it("changes when any field changes", async () => {
    const hash = await hashSubmission(fields);

    expect(await hashSubmission(["Ana Peres", ...fields.slice(1)])).not.toBe(hash);
    expect(await hashSubmission([...fields.slice(0, 4), "Lima"])).not.toBe(hash);
  });
});
