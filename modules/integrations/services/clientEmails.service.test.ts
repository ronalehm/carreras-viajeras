// @vitest-environment node
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { drizzle } from "drizzle-orm/neon-http";
import { PGlite } from "@electric-sql/pglite";
import { createEmbeddedDb } from "@/lib/testing/embeddedDb";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/env", () => ({ getClientEmailEnv: vi.fn() }));
import { getDb } from "@/lib/db";
import { getClientEmailEnv } from "@/lib/env";
import {
  ackClientEmail,
  authorizeClientEmail,
  claimClientEmails,
  clientEmailTemplate,
  failClientEmail,
  retryClientEmail,
} from "./clientEmails.service";

type Query = { sql: string; params: unknown[] };
function fakeDb(responses: unknown[][] = []) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    return { rows: responses[queries.length - 1] ?? [] };
  });
  const transaction = vi.fn((pending: Promise<unknown>[]) =>
    Promise.all(pending),
  );
  vi.mocked(getDb).mockReturnValue(
    drizzle(Object.assign(query, { transaction }) as never) as ReturnType<
      typeof getDb
    >,
  );
  return { queries, transaction };
}
const id = "a0000000-0000-4000-8000-000000000001";
const token = "b0000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.mocked(getDb).mockReset();
  vi.mocked(getClientEmailEnv).mockReturnValue({
    from: "sender@example.test",
    startAt: new Date("2026-10-29T00:00:00Z"),
  });
});

describe("email engine against PostgreSQL", () => {
  let pg: PGlite;
  let embedded: Awaited<ReturnType<typeof createEmbeddedDb>>;
  beforeAll(async () => {
    embedded = await createEmbeddedDb();
    pg = embedded.pg;
  }, 30000);
  afterAll(async () => {
    await pg?.close();
  });

  beforeEach(async () => {
    // Only this isolated, in-memory database. Never getEnv(), Neon or a network connection.
    await pg.exec("TRUNCATE leads, profiles RESTART IDENTITY CASCADE");
    await pg.query(
      "INSERT INTO profiles(user_id,email) VALUES ('staff','staff@example.test')",
    );
    vi.mocked(getClientEmailEnv).mockReturnValue({
      from: "sender@example.test",
      startAt: new Date("2000-01-01T00:00:00Z"),
    });
    vi.mocked(getDb).mockReturnValue(embedded.db as ReturnType<typeof getDb>);
  });

  async function seed(
    overrides: {
      email?: string | null;
      source?: string;
      optedOut?: boolean;
    } = {},
  ) {
    const result = await pg.query<{ id: string }>(
      `INSERT INTO leads(full_name,phone,email,source,consent_version,contact_opt_out_at)
      VALUES ('Ana Vega','+51938127170',$1,$2::lead_source,'test-v1',CASE WHEN $3 THEN now() ELSE NULL END) RETURNING id`,
      [
        overrides.email === undefined ? "ana@example.test" : overrides.email,
        overrides.source ?? "web_form",
        overrides.optedOut ?? false,
      ],
    );
    const leadId = result.rows[0].id;
    await pg.query(
      "INSERT INTO outbox_events(type,lead_id,payload) VALUES ('lead.created',$1,'{}')",
      [leadId],
    );
    return leadId;
  }
  async function state(messageId: string) {
    const result = await pg.query<{ status: string; attempts: number }>(
      "SELECT status,attempts FROM client_emails WHERE id=$1",
      [messageId],
    );
    return result.rows[0];
  }
  const claim = () => claimClientEmails({ executionId: "test-run", limit: 1 });

  it("applies every migration, claims once, authorizes once and handles duplicate/out-of-order callbacks", async () => {
    await seed();
    const [first, second] = await Promise.all([claim(), claim()]);
    const messages = [...first.messages, ...second.messages];
    expect(messages).toHaveLength(1);
    const message = messages[0];
    expect(await authorizeClientEmail(message.id, crypto.randomUUID())).toEqual(
      { status: "attempt_conflict" },
    );
    expect(
      await authorizeClientEmail(message.id, message.attemptToken),
    ).toMatchObject({
      status: "authorized",
      message: { to: "ana@example.test" },
    });
    expect(
      await authorizeClientEmail(message.id, message.attemptToken),
    ).toEqual({ status: "attempt_conflict" });
    expect(
      await ackClientEmail(message.id, message.attemptToken, "smtp-1"),
    ).toMatchObject({ status: "sent" });
    expect(
      await ackClientEmail(message.id, message.attemptToken, "smtp-1"),
    ).toMatchObject({ status: "sent" });
    expect(
      await failClientEmail(message.id, message.attemptToken, "smtp_unknown"),
    ).toMatchObject({ status: "sent" });
    expect(await retryClientEmail(message.id, "staff")).toBeNull();
    expect(await state(message.id)).toEqual({ status: "sent", attempts: 1 });
    expect(
      (await pg.query("SELECT status,attempts FROM outbox_events")).rows,
    ).toEqual([{ status: "pending", attempts: 0 }]);
  });

  it.each([
    { optedOut: true },
    { email: null },
    { email: "invalid" },
    { source: "import" },
  ])("omits ineligible contacts %j", async (overrides) => {
    await seed(overrides);
    expect((await claim()).messages).toEqual([]);
    expect((await pg.query("SELECT status FROM client_emails")).rows).toEqual([
      { status: "skipped" },
    ]);
  });

  it("ignores pre-activation events and never sends old stage episodes after a reopen", async () => {
    const leadId = await seed();
    await pg.query("UPDATE outbox_events SET created_at='1990-01-01'");
    expect((await claim()).messages).toEqual([]);
    await pg.query(
      "UPDATE outbox_events SET created_at='2026-10-29T12:00:00Z'",
    );
    await pg.query(
      'INSERT INTO outbox_events(type,lead_id,payload,created_at) VALUES (\'lead.stage_changed\',$1,\'{"stageFrom":"new","stageTo":"reserved"}\',\'2026-10-29T11:00:00Z\'), (\'lead.stage_changed\',$1,\'{"stageFrom":"reserved","stageTo":"new"}\',\'2026-10-29T10:00:00Z\')',
      [leadId],
    );
    const { messages } = await claim();
    expect(messages).toHaveLength(1);
    const statuses = await pg.query<{ stage: string; status: string }>(
      "SELECT m.stage,m.status FROM client_emails m JOIN outbox_events e ON e.id=m.source_event_id ORDER BY e.sequence",
    );
    expect(statuses.rows).toEqual([
      { stage: "new", status: "skipped" },
      { stage: "reserved", status: "skipped" },
      { stage: "new", status: "claimed" },
    ]);
  });

  it.each(["opted_out", "archived", "recipient_changed", "stage_changed"])(
    "rechecks %s immediately before sending",
    async (change) => {
      const leadId = await seed();
      const message = (await claim()).messages[0];
      if (change === "opted_out")
        await pg.query(
          "UPDATE leads SET contact_opt_out_at=now() WHERE id=$1",
          [leadId],
        );
      if (change === "archived")
        await pg.query(
          "UPDATE leads SET archived_at=now(),archived_by='staff' WHERE id=$1",
          [leadId],
        );
      if (change === "recipient_changed")
        await pg.query(
          "UPDATE leads SET email='changed@example.test' WHERE id=$1",
          [leadId],
        );
      if (change === "stage_changed")
        await pg.query("UPDATE leads SET stage='quoted' WHERE id=$1", [leadId]);
      expect(
        await authorizeClientEmail(message.id, message.attemptToken),
      ).toEqual({ status: "skipped" });
      expect((await state(message.id)).status).toBe("skipped");
    },
  );

  it("quarantines expired SMTP attempts and accepts a late confirmation without sending again", async () => {
    await seed();
    const message = (await claim()).messages[0];
    await authorizeClientEmail(message.id, message.attemptToken);
    await pg.query(
      "UPDATE client_emails SET lease_until=now()-interval '1 minute' WHERE id=$1",
      [message.id],
    );
    expect((await claim()).messages).toEqual([]);
    expect((await state(message.id)).status).toBe("unknown");
    expect(await retryClientEmail(message.id, "staff")).toBeNull();
    expect(
      await ackClientEmail(message.id, message.attemptToken),
    ).toMatchObject({ status: "sent" });
  });

  it("can retry a confirmed pre-send failure but rejects the old token and new ineligibility", async () => {
    const leadId = await seed();
    const original = (await claim()).messages[0];
    await failClientEmail(original.id, original.attemptToken, "before_send");
    expect(await retryClientEmail(original.id, "staff")).toBe(leadId);
    const next = (await claim()).messages[0];
    expect(next.attemptToken).not.toBe(original.attemptToken);
    expect(
      await authorizeClientEmail(original.id, original.attemptToken),
    ).toEqual({ status: "attempt_conflict" });
    await failClientEmail(next.id, next.attemptToken, "before_send");
    await pg.query("UPDATE leads SET contact_opt_out_at=now() WHERE id=$1", [
      leadId,
    ]);
    expect(await retryClientEmail(next.id, "staff")).toBeNull();
  });

  it("reclaims an expired pre-send lease with a new token but stops after three claims", async () => {
    await seed();
    let current = (await claim()).messages[0];
    const firstToken = current.attemptToken;
    for (let index = 0; index < 3; index++) {
      await pg.query(
        "UPDATE client_emails SET lease_until=now()-interval '1 minute' WHERE id=$1",
        [current.id],
      );
      const result = await claim();
      if (index < 2) {
        expect(result.messages).toHaveLength(1);
        current = result.messages[0];
        expect(current.attemptToken).not.toBe(firstToken);
      } else expect(result.messages).toHaveLength(0);
    }
    expect(await state(current.id)).toEqual({ status: "failed", attempts: 3 });
    expect(await authorizeClientEmail(current.id, firstToken)).toEqual({
      status: "attempt_conflict",
    });
    expect(await retryClientEmail(current.id, "staff")).toBeNull();
  });
});
describe("email processing", () => {
  it("does no database work when disabled", async () => {
    vi.mocked(getClientEmailEnv).mockReturnValue(null);
    expect(await claimClientEmails({ executionId: "run-1", limit: 1 })).toEqual(
      { enabled: false, messages: [] },
    );
    expect(await authorizeClientEmail(id, token)).toEqual({
      status: "disabled",
    });
    expect(await retryClientEmail(id, "staff")).toBeNull();
    expect(getDb).not.toHaveBeenCalled();
  });
  it("mirrors source events without claiming or changing the original outbox, then leases a bounded batch", async () => {
    const fake = fakeDb([[], [], [{ id, attemptToken: token }]]);
    expect(await claimClientEmails({ executionId: "run-1", limit: 2 })).toEqual(
      { enabled: true, messages: [{ id, attemptToken: token }] },
    );
    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries.some((q) => /UPDATE outbox_events/i.test(q.sql))).toBe(
      false,
    );
    expect(fake.queries[0].sql).toContain("newer.sequence > e.sequence");
    expect(fake.queries[0].params).toContain("2026-10-29T00:00:00.000Z");
    expect(fake.queries[2].sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(fake.queries[2].params).toEqual([2, "run-1"]);
    expect(fake.queries[1].sql).toContain(
      "WHEN status = 'sending' THEN 'unknown'",
    );
  });
  it("stores fixed templates and skipped reasons without relying on request-provided contact data", async () => {
    const candidate = {
      eventId: id,
      leadId: id,
      type: "lead.created",
      payload: {},
      fullName: "Ana Vega",
      email: "ana@example.test",
      currentStage: "new",
      source: "web_form",
      archived: false,
      optedOut: false,
      current: true,
    };
    const fake = fakeDb([
      [candidate, { ...candidate, eventId: token, optedOut: true }],
      [],
      [],
      [],
    ]);
    await claimClientEmails({ executionId: "run", limit: 1 });
    const insert = fake.queries[1];
    expect(insert.sql).toContain("on conflict");
    expect(insert.params).toContain("pending");
    expect(insert.params).toContain("skipped");
    expect(insert.params).toContain("opted_out");
    expect(insert.params).toContain("ana@example.test");
    expect(insert.params).toContain(
      clientEmailTemplate("new", "Ana Vega").body,
    );
  });
  it("locks the contact and rechecks current event, stage, address, opt-out, archive and cutoff just before SMTP", async () => {
    const fake = fakeDb([
      [],
      [
        {
          id,
          status: "sending",
          from: "sender@example.test",
          to: "ana@example.test",
          subject: "Viaje",
          text: "Hola",
        },
      ],
    ]);
    const result = await authorizeClientEmail(id, token);
    expect(result).toMatchObject({
      status: "authorized",
      message: { id, attemptToken: token, to: "ana@example.test" },
    });
    expect(fake.queries[0].sql).toContain("FOR UPDATE OF l");
    const authorize = fake.queries[1].sql;
    for (const fragment of [
      "l.contact_opt_out_at IS NULL",
      "l.archived_at IS NULL",
      "m.recipient = l.email",
      "l.stage = m.stage",
      "newer.sequence > e.sequence",
      "m.status = 'claimed'",
      "m.lease_until > now()",
    ])
      expect(authorize).toContain(fragment);
  });
  it("does not release a payload for a duplicate authorization, stale event or an old attempt", async () => {
    fakeDb([[], []]);
    expect(await authorizeClientEmail(id, token)).toEqual({
      status: "attempt_conflict",
    });
    fakeDb([[], [{ id, status: "skipped", to: "old@example.test" }]]);
    expect(await authorizeClientEmail(id, token)).toEqual({
      status: "skipped",
    });
  });
  it("allows duplicate/late acceptance callbacks with the same attempt, without trusting a newer attempt", async () => {
    const fake = fakeDb([[{ leadId: id, status: "sent" }]]);
    expect(await ackClientEmail(id, token, "smtp-id")).toEqual({
      leadId: id,
      status: "sent",
    });
    expect(fake.queries[0].sql).toContain(
      "status IN ('sending', 'unknown', 'sent')",
    );
    expect(fake.queries[0].params).toEqual(["smtp-id", id, token]);
    fakeDb();
    expect(await ackClientEmail(id, token)).toBeNull();
  });
  it("never regresses accepted mail and treats failures after authorization as unknown", async () => {
    const fake = fakeDb([[{ leadId: id, status: "unknown" }]]);
    await failClientEmail(id, token, "before_send");
    expect(fake.queries[0].sql).toContain(
      "WHEN status IN ('sent', 'failed') THEN status",
    );
    expect(fake.queries[0].sql).toContain("WHEN status = 'claimed'");
    expect(fake.queries[0].sql).toContain("ELSE 'unknown'");
  });
  it("retries only confirmed pre-send failures, with current eligibility and an audit actor", async () => {
    const fake = fakeDb([[], [{ leadId: id }]]);
    expect(await retryClientEmail(id, "session-user")).toBe(id);
    expect(fake.queries[1].sql).toContain(
      "m.last_error_code = 'pre_send_failed'",
    );
    expect(fake.queries[1].sql).toContain("m.status = 'failed'");
    expect(fake.queries[1].sql).toContain("m.attempts < 3");
    expect(fake.queries[1].params).toContain("session-user");
  });
});
