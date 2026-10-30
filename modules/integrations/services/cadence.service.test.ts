// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createEmbeddedDb } from "@/lib/testing/embeddedDb";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/env", () => ({ getClientEmailEnv: vi.fn(), isSalesCadenceEnabled: vi.fn() }));
import { getDb } from "@/lib/db";
import { getClientEmailEnv, isSalesCadenceEnabled } from "@/lib/env";
import { enqueueCadence } from "./cadence.service";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// 2026-11-02 10:00 in Lima (UTC-5, no daylight saving time).
const base = new Date("2026-11-02T15:00:00Z");
const after = (ms: number, from: Date = base) => new Date(from.getTime() + ms);

type CadenceEvent = {
  leadId: string;
  step: string;
  stage: string;
  episodeId: string;
  superseded: boolean;
  dedupeKey: string;
  payload: Record<string, unknown>;
};

describe("enqueueCadence against PostgreSQL", () => {
  let pg: PGlite;
  let embedded: Awaited<ReturnType<typeof createEmbeddedDb>>;
  const env = { from: "sender@example.test", startAt: new Date("2000-01-01T00:00:00Z"), teamAlertEmail: null };

  beforeAll(async () => {
    embedded = await createEmbeddedDb();
    pg = embedded.pg;
  }, 30000);
  afterAll(async () => {
    await pg?.close();
  });

  beforeEach(async () => {
    // Only this isolated, in-memory database. Never Neon or a network connection.
    await pg.exec("TRUNCATE leads, profiles, trips RESTART IDENTITY CASCADE");
    await pg.query("INSERT INTO profiles(user_id,email) VALUES ('staff','staff@example.test')");
    env.startAt = new Date("2000-01-01T00:00:00Z");
    vi.mocked(getClientEmailEnv).mockReset();
    vi.mocked(getClientEmailEnv).mockImplementation(() => ({ ...env }));
    vi.mocked(isSalesCadenceEnabled).mockReset();
    vi.mocked(isSalesCadenceEnabled).mockReturnValue(true);
    vi.mocked(getDb).mockReset();
    vi.mocked(getDb).mockReturnValue(embedded.db as ReturnType<typeof getDb>);
  });

  type LeadOptions = {
    createdAt?: Date;
    email?: string | null;
    source?: string;
    stage?: string;
    optedOut?: boolean;
    archived?: boolean;
  };
  // A lead and its 'created' activity at createdAt. For a later stage, its stage_changed activity
  // into that stage is added by the caller (or not, to test the anchor).
  async function insertLead(options: LeadOptions = {}) {
    const source = options.source ?? "web_form";
    const stage = options.stage ?? "new";
    const result = await pg.query<{ id: string }>(
      `INSERT INTO leads(full_name,phone,email,source,consent_version,contact_opt_out_at,stage,lost_reason,
        archived_at,archived_by,created_by)
      VALUES ('Ana Vega','+51938127170',$1,$2::lead_source,'test-v1',CASE WHEN $3 THEN now() ELSE NULL END,
        $4::lead_stage,CASE WHEN $4 = 'lost' THEN 'test' ELSE NULL END,
        CASE WHEN $5 THEN now() ELSE NULL END,CASE WHEN $5 THEN 'staff' ELSE NULL END,$6) RETURNING id`,
      [
        options.email === undefined ? "ana@example.test" : options.email,
        source,
        options.optedOut ?? false,
        stage,
        options.archived ?? false,
        ["whatsapp", "other"].includes(source) ? "staff" : null,
      ],
    );
    const leadId = result.rows[0].id;
    await pg.query("INSERT INTO lead_activities(lead_id,type,created_at) VALUES ($1,'created',$2)", [
      leadId,
      (options.createdAt ?? base).toISOString(),
    ]);
    return leadId;
  }
  // Moves the lead to stageTo at the given instant (activity + current stage), as the CRM does.
  async function changeStage(leadId: string, stageFrom: string, stageTo: string, at: Date) {
    await pg.query(
      `INSERT INTO lead_activities(lead_id,type,stage_from,stage_to,actor_user_id,created_at)
      VALUES ($1,'stage_changed',$2::lead_stage,$3::lead_stage,'staff',$4)`,
      [leadId, stageFrom, stageTo, at.toISOString()],
    );
    await pg.query(
      "UPDATE leads SET stage=$2::lead_stage, lost_reason=CASE WHEN $2 = 'lost' THEN 'test' ELSE NULL END WHERE id=$1",
      [leadId, stageTo],
    );
  }
  async function responded(leadId: string, at: Date) {
    await pg.query(
      "INSERT INTO lead_activities(lead_id,type,actor_user_id,created_at) VALUES ($1,'responded','staff',$2)",
      [leadId, at.toISOString()],
    );
  }
  async function activityId(leadId: string, type: string, stageTo?: string) {
    const result = await pg.query<{ id: string }>(
      `SELECT id FROM lead_activities WHERE lead_id=$1 AND type=$2::lead_activity_type
        AND ($3::lead_stage IS NULL OR stage_to=$3::lead_stage) ORDER BY created_at DESC LIMIT 1`,
      [leadId, type, stageTo ?? null],
    );
    return result.rows[0].id;
  }
  async function events(): Promise<CadenceEvent[]> {
    const result = await pg.query<{ lead_id: string; payload: Record<string, unknown>; dedupe_key: string }>(
      "SELECT lead_id,payload,dedupe_key FROM outbox_events WHERE type='lead.cadence_due' ORDER BY sequence",
    );
    return result.rows.map((row) => ({
      leadId: row.lead_id,
      step: String(row.payload.step),
      stage: String(row.payload.stage),
      episodeId: String(row.payload.episodeId),
      superseded: row.payload.superseded === true,
      dedupeKey: row.dedupe_key,
      payload: row.payload,
    }));
  }
  const steps = async () => (await events()).map(({ step, superseded }) => (superseded ? `${step}*` : step));

  it("queues the proposal of «Nuevo» 2 hours after the registration, with a minimal payload and its dedupe key", async () => {
    const leadId = await insertLead();
    expect(await enqueueCadence(after(2 * HOUR - 60_000), 20)).toEqual({ enqueued: 0 });
    expect(await enqueueCadence(after(2 * HOUR), 20)).toEqual({ enqueued: 1 });

    const [event] = await events();
    const episodeId = await activityId(leadId, "created");
    expect(event.payload).toEqual({ stage: "new", step: "proposal", episodeId });
    expect(event.dedupeKey).toBe(`cadence:${leadId}:${episodeId}:proposal`);
    expect(JSON.stringify(event.payload)).not.toMatch(/ana|Vega|\+51/i);
  });

  it("queues r3, r5 and r7 on days 3, 5 and 7, each once, and nothing after the last step", async () => {
    await insertLead();
    const enqueued = [];
    for (const moment of [2 * HOUR, 3 * DAY - 60_000, 3 * DAY, 4 * DAY, 5 * DAY, 7 * DAY, 8 * DAY, 9 * DAY])
      enqueued.push((await enqueueCadence(after(moment), 20)).enqueued);
    expect(enqueued).toEqual([1, 0, 1, 0, 1, 1, 0, 0]);
    expect(await steps()).toEqual(["proposal", "r3", "r5", "r7"]);
  });

  it("gives «Contactado» and «Cotizado» r3, r5 and r7 from the stage change, without a proposal", async () => {
    const contacted = await insertLead({ createdAt: after(-DAY) });
    await changeStage(contacted, "new", "contacted", base);
    const quoted = await insertLead({ createdAt: after(-2 * DAY) });
    await changeStage(quoted, "new", "quoted", base);

    expect(await enqueueCadence(after(2 * HOUR), 20)).toEqual({ enqueued: 0 });
    expect(await enqueueCadence(after(3 * DAY), 20)).toEqual({ enqueued: 2 });
    expect(await enqueueCadence(after(5 * DAY), 20)).toEqual({ enqueued: 2 });
    expect(await enqueueCadence(after(7 * DAY), 20)).toEqual({ enqueued: 2 });

    const rows = await events();
    expect(rows.filter((row) => row.leadId === contacted).map((row) => `${row.stage}:${row.step}`)).toEqual([
      "contacted:r3",
      "contacted:r5",
      "contacted:r7",
    ]);
    expect(rows.filter((row) => row.leadId === quoted).map((row) => `${row.stage}:${row.step}`)).toEqual([
      "quoted:r3",
      "quoted:r5",
      "quoted:r7",
    ]);
    expect(new Set(rows.filter((row) => row.leadId === quoted).map((row) => row.episodeId))).toEqual(
      new Set([await activityId(quoted, "stage_changed", "quoted")]),
    );
  });

  it("queues only between 09:00 and 19:00 in Lima: a step due at night waits for the next opening", async () => {
    // Registered at 20:00 in Lima: the proposal is due at 22:00.
    await insertLead({ createdAt: new Date("2026-11-03T01:00:00Z") });
    expect(await enqueueCadence(new Date("2026-11-03T03:30:00Z"), 20)).toEqual({ enqueued: 0 }); // 22:30
    expect(await enqueueCadence(new Date("2026-11-03T13:59:00Z"), 20)).toEqual({ enqueued: 0 }); // 08:59
    expect(await enqueueCadence(new Date("2026-11-03T14:00:00Z"), 20)).toEqual({ enqueued: 1 }); // 09:00
    expect(await steps()).toEqual(["proposal"]);
  });

  it("does not queue at 19:00 sharp nor touch the database outside the window", async () => {
    await insertLead();
    vi.mocked(getDb).mockClear();
    expect(await enqueueCadence(new Date("2026-11-03T00:00:00Z"), 20)).toEqual({ enqueued: 0 }); // 19:00
    expect(getDb).not.toHaveBeenCalled();
    expect(await enqueueCadence(new Date("2026-11-02T23:59:00Z"), 20)).toEqual({ enqueued: 1 }); // 18:59
  });

  it("sends at most one step of an episode per Lima day", async () => {
    // Registered at 18:00 in Lima on Nov 2; no call ran until Nov 5 at 09:00, when only the proposal
    // is due. r3 becomes due at 18:00 the same day, but waits for the next day.
    await insertLead({ createdAt: new Date("2026-11-02T23:00:00Z") });
    expect(await enqueueCadence(new Date("2026-11-05T14:00:00Z"), 20)).toEqual({ enqueued: 1 });
    expect(await enqueueCadence(new Date("2026-11-05T23:30:00Z"), 20)).toEqual({ enqueued: 0 });
    expect(await steps()).toEqual(["proposal"]);
    expect(await enqueueCadence(new Date("2026-11-06T14:00:00Z"), 20)).toEqual({ enqueued: 1 });
    expect(await steps()).toEqual(["proposal", "r3"]);
  });

  it("after a pause queues only the latest due step and records the earlier ones as superseded", async () => {
    await insertLead();
    expect(await enqueueCadence(after(6 * DAY), 20)).toEqual({ enqueued: 1 });
    expect(await steps()).toEqual(["proposal*", "r3*", "r5"]);
    const rows = await events();
    expect(rows[0].payload).toEqual({ stage: "new", step: "proposal", episodeId: rows[0].episodeId, superseded: true });
    expect(rows[2].payload).toEqual({ stage: "new", step: "r5", episodeId: rows[0].episodeId });
    // Superseded steps are never queued again; r7 comes on day 7.
    expect(await enqueueCadence(after(7 * DAY), 20)).toEqual({ enqueued: 1 });
    expect(await steps()).toEqual(["proposal*", "r3*", "r5", "r7"]);
  });

  it("is idempotent across repeated and concurrent calls", async () => {
    await insertLead();
    const [first, second] = await Promise.all([enqueueCadence(after(2 * HOUR), 20), enqueueCadence(after(2 * HOUR), 20)]);
    expect(first.enqueued + second.enqueued).toBe(1);
    expect(await enqueueCadence(after(3 * HOUR), 20)).toEqual({ enqueued: 0 });
    expect(await steps()).toEqual(["proposal"]);
  });

  it("starts a new sequence when the lead goes back to a stage (a new episode)", async () => {
    const leadId = await insertLead();
    expect(await enqueueCadence(after(2 * HOUR), 20)).toEqual({ enqueued: 1 });
    await changeStage(leadId, "new", "contacted", after(DAY));
    // A reply in the «Contactado» episode does not stop the next one.
    await responded(leadId, after(DAY + HOUR));
    await changeStage(leadId, "contacted", "new", after(2 * DAY));
    expect(await enqueueCadence(after(2 * DAY + 2 * HOUR), 20)).toEqual({ enqueued: 1 });

    const rows = await events();
    expect(rows.map((row) => `${row.stage}:${row.step}`)).toEqual(["new:proposal", "new:proposal"]);
    expect(rows[0].episodeId).toBe(await activityId(leadId, "created"));
    expect(rows[1].episodeId).toBe(await activityId(leadId, "stage_changed", "new"));
    // The old episode's steps are not queued for the new one: its r3 counts from the reopening.
    expect(await enqueueCadence(after(3 * DAY), 20)).toEqual({ enqueued: 0 });
    expect(await enqueueCadence(after(5 * DAY), 20)).toEqual({ enqueued: 1 });
    expect((await events()).at(-1)).toMatchObject({ step: "r3", episodeId: rows[1].episodeId });
  });

  it("stops the episode after a «Respondió» activity", async () => {
    const leadId = await insertLead();
    await responded(leadId, after(HOUR));
    expect(await enqueueCadence(after(2 * HOUR), 20)).toEqual({ enqueued: 0 });
    expect(await enqueueCadence(after(3 * DAY), 20)).toEqual({ enqueued: 0 });
    expect(await events()).toEqual([]);
  });

  it.each([
    ["opted out", { optedOut: true }],
    ["archived", { archived: true }],
    ["imported", { source: "import" }],
    ["without email", { email: null }],
  ])("excludes a lead %s", async (_label, options: LeadOptions) => {
    await insertLead(options);
    expect(await enqueueCadence(after(2 * HOUR), 20)).toEqual({ enqueued: 0 });
    expect(await enqueueCadence(after(3 * DAY), 20)).toEqual({ enqueued: 0 });
    expect(await events()).toEqual([]);
  });

  it.each(["reserved", "paid", "lost"])("gives no steps to a lead in %s", async (stage) => {
    const leadId = await insertLead({ createdAt: after(-DAY) });
    await changeStage(leadId, "new", stage, base);
    for (const moment of [2 * HOUR, 3 * DAY, 5 * DAY, 7 * DAY])
      expect(await enqueueCadence(after(moment), 20)).toEqual({ enqueued: 0 });
    expect(await events()).toEqual([]);
  });

  it("ignores episodes that started before CRM_EMAIL_AUTOMATION_START_AT", async () => {
    env.startAt = after(60_000);
    await insertLead();
    const later = await insertLead({ createdAt: after(2 * 60_000) });
    expect(await enqueueCadence(after(3 * HOUR), 20)).toEqual({ enqueued: 1 });
    expect((await events()).map((row) => row.leadId)).toEqual([later]);
  });

  it("does nothing, without querying, while the automation is off", async () => {
    await insertLead();
    vi.mocked(getClientEmailEnv).mockReturnValue(null);
    vi.mocked(getDb).mockClear();
    expect(await enqueueCadence(after(2 * HOUR), 20)).toEqual({ enqueued: 0 });
    expect(getDb).not.toHaveBeenCalled();
    expect(await events()).toEqual([]);
  });

  it("does nothing, without querying, while the sales cadence switch is off (until Phase 2)", async () => {
    await insertLead();
    vi.mocked(isSalesCadenceEnabled).mockReturnValue(false);
    vi.mocked(getDb).mockClear();
    expect(await enqueueCadence(after(2 * HOUR), 20)).toEqual({ enqueued: 0 });
    expect(await enqueueCadence(after(3 * DAY), 20)).toEqual({ enqueued: 0 });
    expect(getDb).not.toHaveBeenCalled();
    expect(await events()).toEqual([]);
  });

  it("queues at most `limit` episodes per call, oldest episode first; superseded steps do not count", async () => {
    const oldest = await insertLead({ createdAt: after(-6 * DAY) });
    const middle = await insertLead({ createdAt: after(-HOUR) });
    const newest = await insertLead({ createdAt: after(-30 * 60_000) });
    const now = after(2 * HOUR);

    expect(await enqueueCadence(now, 2)).toEqual({ enqueued: 2 });
    const first = await events();
    expect(first.filter((row) => !row.superseded).map((row) => row.leadId)).toEqual([oldest, middle]);
    expect(first.filter((row) => row.superseded)).toHaveLength(2); // proposal and r3 of the oldest

    expect(await enqueueCadence(now, 2)).toEqual({ enqueued: 1 });
    expect((await events()).at(-1)?.leadId).toBe(newest);
  });

  // Migration 0018 (crm-sales-cadence.md, requirement 5): an authorless opted_out is only the
  // unsubscribe confirmed from the email link, with its fixed note.
  describe("lead_activities CHECKs for the unsubscribe from the email link", () => {
    const NOTE = "Baja desde el enlace del correo";
    const insertOptedOut = async (leadId: string, actor: string | null, body: string | null) =>
      pg.query("INSERT INTO lead_activities(lead_id,type,actor_user_id,body) VALUES ($1,'opted_out',$2,$3)", [
        leadId,
        actor,
        body,
      ]);

    it("accepts an authorless opted_out with the exact note", async () => {
      const leadId = await insertLead();
      await expect(insertOptedOut(leadId, null, NOTE)).resolves.toBeDefined();
    });

    it("rejects an authorless opted_out without the note", async () => {
      const leadId = await insertLead();
      await expect(insertOptedOut(leadId, null, null)).rejects.toThrow(/lead_activities_actor_chk/);
    });

    it.each(["Baja desde el enlace", "baja desde el enlace del correo", `${NOTE}.`])(
      "rejects an authorless opted_out with another note (%j)",
      async (body) => {
        const leadId = await insertLead();
        await expect(insertOptedOut(leadId, null, body)).rejects.toThrow(/lead_activities_(actor|body)_chk/);
      },
    );

    it("keeps the CRM opt-out: with an author and no body", async () => {
      const leadId = await insertLead();
      await expect(insertOptedOut(leadId, "staff", null)).resolves.toBeDefined();
    });

    it("rejects the link note on an opted_out with an author", async () => {
      const leadId = await insertLead();
      await expect(insertOptedOut(leadId, "staff", NOTE)).rejects.toThrow(/lead_activities_body_chk/);
    });
  });
});
