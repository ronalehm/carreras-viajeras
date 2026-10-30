// @vitest-environment node
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { getDb } from "@/lib/db";
import { approveContractVersion, contractReviewHash, createContractDraft, updateContractDraft } from "./contracts.service";

const enabled = process.env.CHECKOUT_POSTGRES_TESTS === "true";
const database = "cv_stripe_checkout_test";
const pool = new Pool({ host: "127.0.0.1", port: 55432, user: "postgres", database });
const adminId = "checkout-test-admin";
const body = "Texto sintético de contrato para probar las restricciones en PostgreSQL local.";
const input = { versionKey: "pg-checkout-contract-v1", title: "Contrato PostgreSQL", body };

describe.skipIf(!enabled)("contract service on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (database !== "cv_stripe_checkout_test") throw new Error("unsafe postgres test database");
    const client = await pool.connect();
    try {
      const existing = await client.query("select tablename from pg_tables where schemaname='public' order by tablename");
      const tables = existing.rows.map(row => row.tablename);
      if (tables.length === 0) {
        await client.query("create table profiles (user_id text primary key, email text not null)");
        const migration = readFileSync("drizzle/0009_striped_tinkerer.sql", "utf8");
        for (const statement of migration.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean)) {
          await client.query(statement);
        }
      } else if (tables.join(",") === "contract_versions,profiles") {
        await client.query("truncate contract_versions, profiles");
      } else {
        throw new Error("PostgreSQL test database contains unexpected tables");
      }
      await client.query("insert into profiles (user_id,email) values ($1,$2) on conflict do nothing", [adminId,"stripe-contract-test@example.invalid"]);
    } finally {
      client.release();
    }
    vi.mocked(getDb).mockReturnValue(drizzlePg(pool) as unknown as ReturnType<typeof getDb>);
  });

  afterAll(async () => { await pool.end(); });

  it("enforces the real migration constraints and keeps approved text immutable", async () => {
    const draft = await createContractDraft(input, adminId);
    if (typeof draft === "string") throw new Error("draft insert failed");
    await expect(createContractDraft(input, adminId)).resolves.toBe("version_exists");
    await expect(pool.query("insert into contract_versions (version_key,title,body,created_by) values ($1,$2,$3,$4)", ["invalid!","Bad",body,adminId])).rejects.toMatchObject({ code: "23514" });
    const reviewHash = contractReviewHash(input);
    await expect(approveContractVersion({ id: draft.id, documentHash: reviewHash }, adminId)).resolves.toBe("approved");
    await expect(updateContractDraft({ id: draft.id, title: "Changed", body })).resolves.toBe("not_draft");
    const saved = await pool.query("select status,document_hash,title from contract_versions where id=$1", [draft.id]);
    expect(saved.rows[0]).toEqual({ status: "approved", document_hash: reviewHash, title: input.title });
  });

  it("allows only one concurrent approval of the same reviewed version", async () => {
    const unique = { ...input, versionKey: "pg-checkout-contract-v2" };
    const draft = await createContractDraft(unique, adminId);
    if (typeof draft === "string") throw new Error("draft insert failed");
    const reviewHash = contractReviewHash(unique);
    const results = await Promise.all([
      approveContractVersion({ id: draft.id, documentHash: reviewHash }, adminId),
      approveContractVersion({ id: draft.id, documentHash: reviewHash }, adminId),
    ]);
    expect(results.filter(result => result === "approved")).toHaveLength(1);
    expect(results.filter(result => result === "changed" || result === "not_draft")).toHaveLength(1);
    const count = await pool.query("select count(*)::int as count from contract_versions where version_key=$1 and status='approved'", [unique.versionKey]);
    expect(count.rows[0].count).toBe(1);
  });
});
