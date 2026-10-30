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
vi.mock("@/lib/env", () => ({
  getClientEmailEnv: vi.fn(),
  isSalesCadenceEnabled: vi.fn(),
  getEnv: vi.fn(() => ({ APP_ORIGIN: "https://carreras-viajeras.mentec.dev" })),
}));
// The real offer resolution (getActiveOffer) against the embedded database, without loading the rest
// of the trips module (components and actions).
vi.mock("@/modules/trips", async () => ({
  getActiveOffer: (
    await vi.importActual<typeof import("@/modules/trips/services/offers.service")>(
      "@/modules/trips/services/offers.service",
    )
  ).getActiveOffer,
}));
// The real active version read (getActiveWelcomeDiscount) against the embedded database, without
// loading the rest of the rewards module (components and actions).
vi.mock("@/modules/rewards", async () => ({
  getActiveWelcomeDiscount: (
    await vi.importActual<typeof import("@/modules/rewards/services/welcomeDiscount.service")>(
      "@/modules/rewards/services/welcomeDiscount.service",
    )
  ).getActiveWelcomeDiscount,
}));
// The real generator unless a test forces a value (collision on the unique index of code).
vi.mock("../utils/welcomeCode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/welcomeCode")>();
  return { ...actual, generateWelcomeCode: vi.fn(actual.generateWelcomeCode) };
});
// The real templates, observed to check what each preparation rendered.
vi.mock("../utils/lifecycleEmailTemplates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/lifecycleEmailTemplates")>();
  return { ...actual, lifecycleEmailTemplate: vi.fn(actual.lifecycleEmailTemplate) };
});
import { getDb } from "@/lib/db";
import { getClientEmailEnv, isSalesCadenceEnabled } from "@/lib/env";
import { cadenceEmailTemplate, type CadenceOffer } from "../utils/cadenceEmailTemplates";
import { lifecycleEmailTemplate } from "../utils/lifecycleEmailTemplates";
import { generateWelcomeCode, WELCOME_CODE_PATTERN } from "../utils/welcomeCode";
import {
  ackClientEmail,
  authorizeClientEmail,
  claimClientEmails,
  clientEmailTemplate,
  failClientEmail,
  retryClientEmail,
  type EmailClaim,
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
const APP_ORIGIN = "https://carreras-viajeras.mentec.dev";
beforeEach(() => {
  vi.mocked(getDb).mockReset();
  // Sales cadence switch on by default: the current behavior. Tests that need it off override it.
  vi.mocked(isSalesCadenceEnabled).mockReset();
  vi.mocked(isSalesCadenceEnabled).mockReturnValue(true);
  vi.mocked(getClientEmailEnv).mockReturnValue({
    from: "sender@example.test",
    startAt: new Date("2026-10-29T00:00:00Z"),
    teamAlertEmail: "team@example.test",
  });
});

describe("email engine against PostgreSQL", () => {
  let pg: PGlite;
  let embedded: Awaited<ReturnType<typeof createEmbeddedDb>>;
  // Mutable per test: each call to getClientEmailEnv() returns the current values.
  const env = {
    from: "sender@example.test",
    startAt: new Date("2000-01-01T00:00:00Z"),
    teamAlertEmail: "team@example.test" as string | null,
  };
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
    await pg.query(
      "INSERT INTO profiles(user_id,email) VALUES ('staff','staff@example.test'),('owner','owner@example.test'),('other','other@example.test')",
    );
    // owner and other are commercials (leads.manage); staff has no role.
    await pg.query(
      "INSERT INTO staff_assignments(user_id,role,reason) VALUES ('owner','commercial','test'),('other','commercial','test')",
    );
    env.startAt = new Date("2000-01-01T00:00:00Z");
    env.teamAlertEmail = "team@example.test";
    vi.mocked(getClientEmailEnv).mockImplementation(() => ({ ...env }));
    vi.mocked(getDb).mockReturnValue(embedded.db as ReturnType<typeof getDb>);
  });

  type LeadOptions = {
    email?: string | null;
    source?: string;
    optedOut?: boolean;
    stage?: string;
    tripId?: string | null;
    destinationText?: string | null;
    ownerUserId?: string | null;
    nextActionDate?: string | null;
    nextActionNote?: string | null;
    campaignId?: string | null;
  };
  // Manual sources need an author (leads_created_by_chk); system sources have none.
  async function insertLead(options: LeadOptions = {}) {
    const source = options.source ?? "web_form";
    const result = await pg.query<{ id: string }>(
      `INSERT INTO leads(full_name,phone,email,source,consent_version,contact_opt_out_at,stage,trip_id,
        destination_text,owner_user_id,next_action_date,next_action_note,created_by,campaign_id)
      VALUES ('Ana Vega','+51938127170',$1,$2::lead_source,'test-v1',CASE WHEN $3 THEN now() ELSE NULL END,
        $4::lead_stage,$5::uuid,$6,$7,$8::date,$9,$10,$11::uuid) RETURNING id`,
      [
        options.email === undefined ? "ana@example.test" : options.email,
        source,
        options.optedOut ?? false,
        options.stage ?? "new",
        options.tripId ?? null,
        options.destinationText ?? null,
        options.ownerUserId ?? null,
        options.nextActionDate ?? null,
        options.nextActionNote ?? null,
        ["whatsapp", "other"].includes(source) ? "staff" : null,
        options.campaignId ?? null,
      ],
    );
    return result.rows[0].id;
  }
  async function addEvent(type: string, leadId: string, payload: object = {}) {
    const result = await pg.query<{ id: string }>(
      "INSERT INTO outbox_events(type,lead_id,payload,dedupe_key) VALUES ($1::outbox_event_type,$2,$3::jsonb,$4) RETURNING id",
      [
        type,
        leadId,
        JSON.stringify(payload),
        type === "lead.follow_up_due" ? crypto.randomUUID() : null,
      ],
    );
    return result.rows[0].id;
  }
  // A new lead and its lead.created event (payload { source, ...extra }).
  async function seed(options: LeadOptions = {}, extra: object = {}) {
    const leadId = await insertLead(options);
    await addEvent("lead.created", leadId, {
      source: options.source ?? "web_form",
      ...extra,
    });
    return leadId;
  }
  // A lead moved to «contacted»: a single stage email.
  async function seedStage() {
    const leadId = await insertLead({ stage: "contacted" });
    await addEvent("lead.stage_changed", leadId, {
      stageFrom: "new",
      stageTo: "contacted",
    });
    return leadId;
  }
  type EmailRow = {
    id: string;
    kind: string;
    stage: string;
    status: string;
    recipient: string | null;
    lastErrorCode: string | null;
    subject: string;
    body: string;
  };
  async function emails() {
    const result = await pg.query<EmailRow>(
      `SELECT m.id,m.kind,m.stage,m.status,m.recipient,m.last_error_code AS "lastErrorCode",m.subject,m.body
      FROM client_emails m JOIN outbox_events e ON e.id = m.source_event_id ORDER BY e.sequence, m.kind`,
    );
    return result.rows;
  }
  const summary = async () =>
    (await emails()).map(({ kind, status, lastErrorCode }) => ({
      kind,
      status,
      lastErrorCode,
    }));
  async function state(messageId: string) {
    const result = await pg.query<{ status: string; attempts: number }>(
      "SELECT status,attempts FROM client_emails WHERE id=$1",
      [messageId],
    );
    return result.rows[0];
  }
  async function kindOf(messageId: string) {
    const result = await pg.query<{ kind: string }>(
      "SELECT kind FROM client_emails WHERE id=$1",
      [messageId],
    );
    return result.rows[0].kind;
  }
  // Authorizes every claimed message and returns { kind: result status }.
  async function authorizeAll(messages: EmailClaim[]) {
    const results: Record<string, string> = {};
    for (const message of messages)
      results[await kindOf(message.id)] = (
        await authorizeClientEmail(message.id, message.attemptToken)
      ).status;
    return results;
  }
  const claim = () => claimClientEmails({ executionId: "test-run", limit: 1 });
  const claimAll = () =>
    claimClientEmails({ executionId: "test-run", limit: 10 });

  it("applies every migration, claims once, authorizes once and handles duplicate/out-of-order callbacks", async () => {
    await seedStage();
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

  describe("preparation", () => {
    it.each([
      { source: "web_form", extra: { form: "registration" }, welcome: "welcome_registration" },
      { source: "web_form", extra: { form: "contact" }, welcome: "welcome_contact" },
      { source: "web_form", extra: {}, welcome: "welcome_contact" },
      { source: "runner_account", extra: {}, welcome: "welcome_account" },
      { source: "google_form", extra: {}, welcome: "welcome_registration" },
      { source: "whatsapp", extra: {}, welcome: "welcome_contact" },
      { source: "other", extra: {}, welcome: "welcome_contact" },
    ])(
      "lead.created from $source $extra: $welcome + team_alert and no «Nuevo» stage email",
      async ({ source, extra, welcome }) => {
        await seed({ source, destinationText: "Maratón de Lima" }, extra);
        const { messages } = await claimAll();
        expect(messages).toHaveLength(2);
        const rows = await emails();
        expect(rows.map((row) => row.kind)).toEqual([welcome, "team_alert"]);
        expect(rows.some((row) => row.kind === "stage")).toBe(false);
        expect(rows.map(({ stage, status, recipient }) => ({ stage, status, recipient }))).toEqual([
          { stage: "new", status: "claimed", recipient: "ana@example.test" },
          { stage: "new", status: "claimed", recipient: "team@example.test" },
        ]);
        const { subject, body } = lifecycleEmailTemplate(welcome as "welcome_contact", {
          fullName: "Ana Vega",
          race: "Maratón de Lima",
        });
        expect(rows[0]).toMatchObject({ subject, body });
        expect(rows[0].body).not.toBe(clientEmailTemplate("new", "Ana Vega").body);
      },
    );

    it("never creates a second email of the same (event, kind) under repeated or concurrent claims", async () => {
      await seed({}, { form: "registration" });
      const results = await Promise.all([claimAll(), claimAll(), claimAll()]);
      const messages = results.flatMap((result) => result.messages);
      expect(new Set(messages.map((message) => message.id)).size).toBe(2);
      expect(messages).toHaveLength(2);
      await claimAll();
      await claimAll();
      const rows = await pg.query<{ kind: string; total: number }>(
        "SELECT kind, count(*)::int AS total FROM client_emails GROUP BY kind ORDER BY kind",
      );
      expect(rows.rows).toEqual([
        { kind: "welcome_registration", total: 1 },
        { kind: "team_alert", total: 1 },
      ]);
      const event = await pg.query<{ id: string; lead_id: string }>(
        "SELECT id, lead_id FROM outbox_events",
      );
      await expect(
        pg.query(
          `INSERT INTO client_emails(source_event_id,lead_id,kind,stage,recipient,sender,subject,body)
          VALUES ($1,$2,'team_alert','new','team@example.test','sender@example.test','Asunto','Cuerpo')`,
          [event.rows[0].id, event.rows[0].lead_id],
        ),
      ).rejects.toThrow(/client_emails_event_kind_uq/);
    });

    it("accepts a runner_account lead without author and still requires one for manual sources", async () => {
      const leadId = await insertLead({ source: "runner_account" });
      const lead = await pg.query("SELECT source, created_by FROM leads WHERE id=$1", [leadId]);
      expect(lead.rows).toEqual([{ source: "runner_account", created_by: null }]);
      await expect(
        pg.query(
          "INSERT INTO leads(full_name,phone,source,consent_version) VALUES ('Ana Vega','+51938127170','whatsapp','test-v1')",
        ),
      ).rejects.toThrow(/leads_created_by_chk/);
    });

    it.each([
      { source: "import", extra: {} },
      { source: "google_form", extra: { bulk: true } },
    ])(
      "an import ($source $extra) gets one skipped stage row with bulk_import and no alert",
      async ({ source, extra }) => {
        await seed({ source }, extra);
        expect((await claimAll()).messages).toEqual([]);
        expect(await summary()).toEqual([
          { kind: "stage", status: "skipped", lastErrorCode: "bulk_import" },
        ]);
      },
    );

    it.each([{ email: null }, { email: "invalid" }])(
      "skips the welcome without a valid address %j but still alerts the team",
      async ({ email }) => {
        await seed({ email });
        expect((await claimAll()).messages).toHaveLength(1);
        expect(await summary()).toEqual([
          { kind: "welcome_contact", status: "skipped", lastErrorCode: "missing_email" },
          { kind: "team_alert", status: "claimed", lastErrorCode: null },
        ]);
      },
    );

    it("skips the team alert with missing_team_address without CRM_TEAM_ALERT_EMAIL", async () => {
      env.teamAlertEmail = null;
      await seed();
      await claimAll();
      expect(
        (await emails()).map(({ kind, status, recipient, lastErrorCode }) => ({
          kind,
          status,
          recipient,
          lastErrorCode,
        })),
      ).toEqual([
        { kind: "welcome_contact", status: "claimed", recipient: "ana@example.test", lastErrorCode: null },
        { kind: "team_alert", status: "skipped", recipient: null, lastErrorCode: "missing_team_address" },
      ]);
    });

    it("keeps legacy events handled before kinds existed as a single stage row", async () => {
      const leadId = await insertLead();
      const eventId = await addEvent("lead.created", leadId, { source: "web_form" });
      await pg.query(
        `INSERT INTO client_emails(source_event_id,lead_id,stage,recipient,sender,subject,body,status,last_error_code)
        VALUES ($1,$2,'new','ana@example.test','sender@example.test','Viaje','Hola Ana','skipped','obsolete_event')`,
        [eventId, leadId],
      );
      expect((await claimAll()).messages).toEqual([]);
      expect(await summary()).toEqual([
        { kind: "stage", status: "skipped", lastErrorCode: "obsolete_event" },
      ]);
    });
  });

  describe("eligibility", () => {
    it("opt-out: client emails are omitted, the team alert is still sent", async () => {
      await seed({ optedOut: true });
      const { messages } = await claimAll();
      expect(await summary()).toEqual([
        { kind: "welcome_contact", status: "skipped", lastErrorCode: "opted_out" },
        { kind: "team_alert", status: "claimed", lastErrorCode: null },
      ]);
      expect(await authorizeAll(messages)).toEqual({ team_alert: "authorized" });
    });

    it("rechecks the opt-out before SMTP: welcome skipped, team alert authorized", async () => {
      const leadId = await seed({}, { form: "registration" });
      const { messages } = await claimAll();
      await pg.query("UPDATE leads SET contact_opt_out_at=now() WHERE id=$1", [leadId]);
      expect(await authorizeAll(messages)).toEqual({
        welcome_registration: "skipped",
        team_alert: "authorized",
      });
    });

    it("archived: no email at all, at preparation or just before SMTP", async () => {
      const archived = await seed();
      await pg.query(
        "UPDATE leads SET archived_at=now(),archived_by='staff' WHERE id=$1",
        [archived],
      );
      expect((await claimAll()).messages).toEqual([]);
      expect(await summary()).toEqual([
        { kind: "welcome_contact", status: "skipped", lastErrorCode: "archived" },
        { kind: "team_alert", status: "skipped", lastErrorCode: "archived" },
      ]);
      const later = await seed();
      const { messages } = await claimAll();
      expect(messages).toHaveLength(2);
      await pg.query(
        "UPDATE leads SET archived_at=now(),archived_by='staff' WHERE id=$1",
        [later],
      );
      expect(await authorizeAll(messages)).toEqual({
        welcome_contact: "skipped",
        team_alert: "skipped",
      });
    });

    it("skips a claimed team alert with missing_team_address when the address is removed before SMTP", async () => {
      await seed();
      const { messages } = await claimAll();
      env.teamAlertEmail = null;
      expect(await authorizeAll(messages)).toEqual({
        welcome_contact: "authorized",
        team_alert: "skipped",
      });
      const rows = await emails();
      expect(rows.find((row) => row.kind === "team_alert")?.lastErrorCode).toBe(
        "missing_team_address",
      );
    });

    it("a welcome does not require the same stage nor the latest event", async () => {
      const leadId = await seed({}, { form: "registration" });
      const { messages } = await claimAll();
      await pg.query("UPDATE leads SET stage='contacted' WHERE id=$1", [leadId]);
      await addEvent("lead.stage_changed", leadId, { stageFrom: "new", stageTo: "contacted" });
      const results = await authorizeAll(messages);
      expect(results.welcome_registration).toBe("authorized");
    });

    it("owner_alert goes to the current owner with an active role, even after an opt-out", async () => {
      const leadId = await insertLead({ ownerUserId: "owner", optedOut: true, stage: "contacted" });
      await addEvent("lead.owner_assigned", leadId);
      const { messages } = await claimAll();
      const rows = await emails();
      expect(rows).toMatchObject([
        { kind: "owner_alert", stage: "contacted", status: "claimed", recipient: "owner@example.test" },
      ]);
      expect(rows[0].body).toContain("Etapa: Contactado");
      const result = await authorizeClientEmail(messages[0].id, messages[0].attemptToken);
      expect(result).toMatchObject({
        status: "authorized",
        message: { to: "owner@example.test", from: "sender@example.test" },
      });
    });

    it("skips owner_alert with owner_changed when the owner has no active role at preparation", async () => {
      const leadId = await insertLead({ ownerUserId: "staff" });
      await addEvent("lead.owner_assigned", leadId);
      expect((await claimAll()).messages).toEqual([]);
      expect(
        (await emails()).map(({ kind, status, recipient, lastErrorCode }) => ({
          kind,
          status,
          recipient,
          lastErrorCode,
        })),
      ).toEqual([
        { kind: "owner_alert", status: "skipped", recipient: null, lastErrorCode: "owner_changed" },
      ]);
    });

    it.each([
      ["the owner changed", "UPDATE leads SET owner_user_id='other' WHERE id=$1"],
      ["the owner was removed", "UPDATE leads SET owner_user_id=NULL WHERE id=$1"],
      [
        "the owner lost the role",
        "UPDATE staff_assignments SET revoked_at=now(), revoked_by='staff' WHERE user_id='owner' AND $1::uuid IS NOT NULL",
      ],
    ])("skips owner_alert with owner_changed when %s before SMTP", async (_, change) => {
      const leadId = await insertLead({ ownerUserId: "owner" });
      await addEvent("lead.owner_assigned", leadId);
      const { messages } = await claimAll();
      await pg.query(change, [leadId]);
      expect(await authorizeAll(messages)).toEqual({ owner_alert: "skipped" });
      expect((await summary())[0]).toEqual({
        kind: "owner_alert",
        status: "skipped",
        lastErrorCode: "owner_changed",
      });
    });

    it("two owner assignments before preparing: only the last one gets a sendable owner_alert", async () => {
      const leadId = await insertLead({ ownerUserId: "owner" });
      // Assigned to «other», then reassigned to «owner» before the engine runs.
      await addEvent("lead.owner_assigned", leadId);
      await addEvent("lead.owner_assigned", leadId);
      const { messages } = await claimAll();
      expect(messages).toHaveLength(1);
      expect(
        (await emails()).map(({ kind, status, recipient, lastErrorCode }) => ({
          kind,
          status,
          recipient,
          lastErrorCode,
        })),
      ).toEqual([
        { kind: "owner_alert", status: "skipped", recipient: "owner@example.test", lastErrorCode: "owner_changed" },
        { kind: "owner_alert", status: "claimed", recipient: "owner@example.test", lastErrorCode: null },
      ]);
      expect(await authorizeClientEmail(messages[0].id, messages[0].attemptToken)).toMatchObject({
        status: "authorized",
        message: { to: "owner@example.test" },
      });
    });

    it("a reassignment after preparing and before SMTP skips the earlier owner_alert with owner_changed", async () => {
      const leadId = await insertLead({ ownerUserId: "owner" });
      await addEvent("lead.owner_assigned", leadId);
      const first = (await claimAll()).messages;
      // Reassigned away and back: same owner at authorization, but a later assignment exists.
      await addEvent("lead.owner_assigned", leadId);
      expect(await authorizeAll(first)).toEqual({ owner_alert: "skipped" });
      expect((await summary())[0]).toEqual({
        kind: "owner_alert",
        status: "skipped",
        lastErrorCode: "owner_changed",
      });
      const second = (await claimAll()).messages;
      expect(second).toHaveLength(1);
      expect(await authorizeAll(second)).toEqual({ owner_alert: "authorized" });
    });

    it("a retry of an owner_alert is rejected once a later owner assignment exists", async () => {
      const leadId = await insertLead({ ownerUserId: "owner" });
      await addEvent("lead.owner_assigned", leadId);
      const [message] = (await claimAll()).messages;
      await failClientEmail(message.id, message.attemptToken, "before_send");
      await addEvent("lead.owner_assigned", leadId);
      expect(await retryClientEmail(message.id, "staff")).toBeNull();
    });

    it.each([
      ["a web lead without owner", { source: "web_form" }, "sin asignar"],
      ["a manual lead with an owner", { source: "whatsapp", ownerUserId: "owner" }, "owner@example.test"],
      ["an owner without an active role", { source: "other", ownerUserId: "staff" }, "staff@example.test"],
    ] as const)("team_alert shows the current owner for %s", async (_, lead, owner) => {
      await seed(lead);
      await claimAll();
      const team = (await emails()).find((row) => row.kind === "team_alert");
      expect(team?.recipient).toBe("team@example.test");
      expect(team?.body.split("\n")).toContain(`Responsable: ${owner}`);
    });

    it("keeps every subject on a single line when destination_text has line breaks", async () => {
      await seed({ destinationText: "Maratón\nde\r\n  Lima" }, { form: "registration" });
      await claimAll();
      expect((await emails()).map(({ kind, subject }) => ({ kind, subject }))).toEqual([
        { kind: "welcome_registration", subject: "Recibimos tu registro para Maratón de Lima" },
        { kind: "team_alert", subject: "Nuevo registro: Ana · Maratón de Lima" },
      ]);
    });

    it("lead.follow_up_due no longer creates a client email (the internal notice goes through the outbox)", async () => {
      const leadId = await insertLead({
        stage: "contacted",
        nextActionDate: "2000-01-01",
        destinationText: "Maratón de Lima",
      });
      await addEvent("lead.follow_up_due", leadId, { stage: "contacted", dueOn: "2000-01-01" });
      expect((await claimAll()).messages).toEqual([]);
      expect(await emails()).toEqual([]);
      // The event itself is left untouched for the generic outbox (internal notice in n8n).
      expect(
        (await pg.query("SELECT type,status FROM outbox_events")).rows,
      ).toEqual([{ type: "lead.follow_up_due", status: "pending" }]);
    });

    it("a follow_up row prepared before the change is skipped before SMTP and cannot be retried", async () => {
      const leadId = await insertLead({ stage: "contacted", nextActionDate: "2000-01-01" });
      const eventId = await addEvent("lead.follow_up_due", leadId, {
        stage: "contacted",
        dueOn: "2000-01-01",
      });
      const second = await addEvent("lead.follow_up_due", leadId, {
        stage: "contacted",
        dueOn: "2000-01-01",
      });
      await pg.query(
        `INSERT INTO client_emails(source_event_id,lead_id,kind,stage,recipient,sender,subject,body,status,attempts,last_error_code)
        VALUES ($1,$3,'follow_up','contacted','ana@example.test','sender@example.test','Asunto','Cuerpo','pending',0,NULL),
          ($2,$3,'follow_up','contacted','ana@example.test','sender@example.test','Asunto','Cuerpo','failed',1,'pre_send_failed')`,
        [eventId, second, leadId],
      );
      const { messages } = await claimAll();
      expect(messages).toHaveLength(1);
      expect(await authorizeAll(messages)).toEqual({ follow_up: "skipped" });
      const failed = await pg.query<{ id: string }>(
        "SELECT id FROM client_emails WHERE status='failed'",
      );
      expect(await retryClientEmail(failed.rows[0].id, "staff")).toBeNull();
      expect(await summary()).toEqual([
        { kind: "follow_up", status: "skipped", lastErrorCode: "ineligible" },
        { kind: "follow_up", status: "failed", lastErrorCode: "pre_send_failed" },
      ]);
    });

    it("booking_confirmed uses the linked booking's trip and replaces the «Reservado» stage email", async () => {
      const trips = await pg.query<{ id: string; slug: string }>(
        `INSERT INTO trips(slug,title,city,country,race_date,distances,summary) VALUES
          ('maraton-lima','Maratón de Lima','Lima','PE','2027-05-16','{42K}','Resumen'),
          ('maraton-berlin','Maratón de Berlín','Berlín','DE','2027-09-26','{42K}','Resumen')
        RETURNING id, slug`,
      );
      const tripId = (slug: string) => trips.rows.find((trip) => trip.slug === slug)?.id;
      const leadId = await insertLead({ stage: "reserved", tripId: tripId("maraton-lima") });
      await pg.query(
        `INSERT INTO bookings(trip_id,participant_name,participant_email,lead_id,status,package_label,total_usd,created_by)
        VALUES ($1,'Ana Vega','ana@example.test',$2,'confirmed','Paquete',100,'staff')`,
        [tripId("maraton-berlin"), leadId],
      );
      await addEvent("lead.stage_changed", leadId, {
        stageFrom: "quoted",
        stageTo: "reserved",
        trigger: "booking",
      });
      const { messages } = await claimAll();
      const rows = await emails();
      expect(rows).toMatchObject([
        {
          kind: "booking_confirmed",
          stage: "reserved",
          status: "claimed",
          subject: "Tu separación para Maratón de Berlín está confirmada",
        },
      ]);
      expect(await authorizeAll(messages)).toEqual({ booking_confirmed: "authorized" });
    });

    it("a reserved stage change without a booking keeps the stage email", async () => {
      const leadId = await insertLead({ stage: "reserved" });
      await addEvent("lead.stage_changed", leadId, { stageFrom: "quoted", stageTo: "reserved" });
      await claimAll();
      expect(await summary()).toEqual([
        { kind: "stage", status: "claimed", lastErrorCode: null },
      ]);
      expect((await emails())[0].body).toBe(clientEmailTemplate("reserved", "Ana Vega").body);
    });

    it("internal alerts carry name, race, entry path or stage and the CRM link only", async () => {
      const created = await seed({
        source: "runner_account",
        destinationText: "Maratón de Lima",
        ownerUserId: "owner",
        nextActionDate: "2000-01-01",
        nextActionNote: "Nota interna reservada",
      });
      await addEvent("lead.owner_assigned", created);
      await claimAll();
      const rows = await emails();
      const team = rows.find((row) => row.kind === "team_alert");
      const owner = rows.find((row) => row.kind === "owner_alert");
      expect(team?.body).toContain("Nombre: Ana Vega");
      expect(team?.body).toContain("Carrera: Maratón de Lima");
      expect(team?.body).toContain("Vía de entrada: Cuenta web");
      expect(team?.body).toContain(`Ficha: ${APP_ORIGIN}/crm/leads/${created}`);
      expect(owner?.body).toContain(`Ficha: ${APP_ORIGIN}/crm/leads/${created}`);
      for (const alert of [team, owner]) {
        const text = `${alert?.subject}\n${alert?.body}`;
        expect(text).not.toContain("938127170");
        expect(text).not.toContain("+51");
        expect(text).not.toContain("Nota interna");
        expect(text).not.toContain("ana@example.test");
      }
    });

    it("ignores events before START_AT and rechecks the cutoff before SMTP", async () => {
      await seed();
      await pg.query("UPDATE outbox_events SET created_at='1990-01-01'");
      expect((await claimAll()).messages).toEqual([]);
      expect(await emails()).toEqual([]);
      await pg.query("UPDATE outbox_events SET created_at='2026-10-29T12:00:00Z'");
      const { messages } = await claimAll();
      expect(messages).toHaveLength(2);
      env.startAt = new Date("2026-10-30T00:00:00Z");
      expect(await authorizeAll(messages)).toEqual({
        welcome_contact: "skipped",
        team_alert: "skipped",
      });
    });

    it("never sends old stage episodes after a reopen, and the welcome replaces the «Nuevo» email", async () => {
      const leadId = await seed();
      await pg.query(
        'INSERT INTO outbox_events(type,lead_id,payload) VALUES (\'lead.stage_changed\',$1,\'{"stageFrom":"new","stageTo":"reserved"}\'), (\'lead.stage_changed\',$1,\'{"stageFrom":"reserved","stageTo":"new"}\')',
        [leadId],
      );
      expect((await claimAll()).messages).toHaveLength(3);
      expect(
        (await emails()).map(({ kind, stage, status }) => ({ kind, stage, status })),
      ).toEqual([
        { kind: "welcome_contact", stage: "new", status: "claimed" },
        { kind: "team_alert", stage: "new", status: "claimed" },
        { kind: "stage", stage: "reserved", status: "skipped" },
        { kind: "stage", stage: "new", status: "claimed" },
      ]);
    });

    it("a retry rechecks the eligibility of its own kind", async () => {
      const leadId = await seed();
      const { messages } = await claimAll();
      for (const message of messages)
        await failClientEmail(message.id, message.attemptToken, "before_send");
      await pg.query(
        "UPDATE leads SET stage='contacted', contact_opt_out_at=now() WHERE id=$1",
        [leadId],
      );
      const byKind = Object.fromEntries(
        await Promise.all(messages.map(async (message) => [await kindOf(message.id), message.id])),
      );
      expect(await retryClientEmail(byKind.welcome_contact, "staff")).toBeNull();
      expect(await retryClientEmail(byKind.team_alert, "staff")).toBe(leadId);
    });
  });

  // crm-welcome-discount.md, requirements 2 and 3: code issued while preparing the welcome.
  describe("welcome discount code", () => {
    beforeEach(() => {
      vi.mocked(generateWelcomeCode).mockClear();
      vi.mocked(lifecycleEmailTemplate).mockClear();
    });
    // A new version through the SQL function of migration 0019 (deactivates the previous one).
    async function createVersion(amountUsd = 50, validityDays = 60, active = true) {
      const result = await pg.query<{ result: { id: string } }>(
        "SELECT cv_create_welcome_discount_version('staff',$1,$2,$3) AS result",
        [amountUsd, validityDays, active],
      );
      return result.rows[0].result.id;
    }
    type CodeRow = {
      code: string;
      email: string;
      amountUsd: number;
      status: string;
      leadId: string;
      sourceEventId: string;
      versionId: string;
      validityDays: number;
      expiresOn: string;
    };
    async function codes() {
      const result = await pg.query<CodeRow>(
        `SELECT code,email,amount_usd AS "amountUsd",status,lead_id AS "leadId",
          source_event_id AS "sourceEventId",version_id AS "versionId",
          extract(day FROM expires_at - issued_at)::int AS "validityDays",
          to_char(expires_at AT TIME ZONE 'America/Lima','YYYY-MM-DD') AS "expiresOn"
        FROM welcome_discount_codes ORDER BY issued_at, code`,
      );
      return result.rows;
    }
    async function welcomeOf(leadId: string) {
      const result = await pg.query<{ kind: string; body: string; templateVersion: number }>(
        `SELECT kind,body,template_version AS "templateVersion" FROM client_emails
        WHERE lead_id=$1 AND kind IN ('welcome_registration','welcome_contact','welcome_account')`,
        [leadId],
      );
      return result.rows[0];
    }
    const eventOf = async (leadId: string) =>
      (
        await pg.query<{ id: string }>(
          "SELECT id FROM outbox_events WHERE lead_id=$1 AND type='lead.created'",
          [leadId],
        )
      ).rows[0].id;
    // Another lead with its own issued code (status/expiry adjustable afterwards).
    async function existingCode(code: string, email: string) {
      const leadId = await seed({ email });
      const versionId = (await pg.query<{ id: string }>("SELECT id FROM welcome_discount_versions LIMIT 1"))
        .rows[0].id;
      await pg.query(
        `INSERT INTO welcome_discount_codes(lead_id,email,code,amount_usd,version_id,source_event_id,expires_at)
        VALUES ($1,$2,$3,50,$4,$5,now() + interval '30 days')`,
        [leadId, email, code, versionId, await eventOf(leadId)],
      );
      // Its welcome is already prepared: only the event under test is pending.
      await pg.query(
        `INSERT INTO client_emails(source_event_id,lead_id,kind,stage,recipient,sender,subject,body)
        VALUES ($1,$2,'welcome_contact','new',$3,'sender@example.test','Asunto','Cuerpo')`,
        [await eventOf(leadId), leadId, email],
      );
      return leadId;
    }
    const noCodeBody = (kind: "welcome_registration" | "welcome_contact") =>
      lifecycleEmailTemplate(kind, { fullName: "Ana Vega", race: "Maratón de Lima" }).body;

    it.each([
      { source: "web_form", extra: { form: "registration" }, kind: "welcome_registration" },
      { source: "web_form", extra: { form: "contact" }, kind: "welcome_contact" },
      { source: "google_form", extra: {}, kind: "welcome_registration" },
    ] as const)(
      "$source $extra without account: issues a code and sends it in the welcome (templateVersion 2)",
      async ({ source, extra, kind }) => {
        const versionId = await createVersion(50, 60);
        const leadId = await seed({ source, destinationText: "Maratón de Lima" }, extra);
        const { messages } = await claimAll();
        expect(messages).toHaveLength(2);
        const [code] = await codes();
        expect(code).toMatchObject({
          email: "ana@example.test",
          amountUsd: 50,
          status: "issued",
          leadId,
          sourceEventId: await eventOf(leadId),
          versionId,
          validityDays: 60,
        });
        expect(code.code).toMatch(WELCOME_CODE_PATTERN);
        const welcome = await welcomeOf(leadId);
        expect(welcome.kind).toBe(kind);
        expect(welcome.templateVersion).toBe(2);
        expect(welcome.body).toBe(
          lifecycleEmailTemplate(kind, {
            fullName: "Ana Vega",
            race: "Maratón de Lima",
            welcomeCode: {
              code: code.code,
              amountUsd: 50,
              expiresOn: code.expiresOn,
              accountUrl: `${APP_ORIGIN}/cuenta`,
            },
          }).body,
        );
        expect(welcome.body).toContain(`Tu código de bienvenida es ${code.code}: US$50 de descuento`);
        expect(welcome.body).toContain(`${APP_ORIGIN}/cuenta`);
        // Only the client's welcome carries the code; the internal alert never does.
        const team = await pg.query<{ body: string }>("SELECT body FROM client_emails WHERE kind='team_alert'");
        expect(team.rows[0].body).not.toContain(code.code);
      },
    );

    it("the expiry date is the America/Lima calendar date of expires_at", async () => {
      await createVersion(75, 1);
      const leadId = await seed();
      const lima = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" });
      const before = lima.format(new Date(Date.now() + 86_400_000));
      await claimAll();
      const after = lima.format(new Date(Date.now() + 86_400_000));
      const [code] = await codes();
      expect([before, after]).toContain(code.expiresOn);
      expect((await welcomeOf(leadId)).body).toContain("US$75 de descuento");
    });

    it("an email with an account gets the normal welcome without a code", async () => {
      await createVersion();
      await pg.query("INSERT INTO profiles(user_id,email) VALUES ('runner','ana@example.test')");
      const leadId = await seed({}, { form: "registration" });
      await claimAll();
      expect(await codes()).toEqual([]);
      expect(await welcomeOf(leadId)).toEqual({
        kind: "welcome_registration",
        templateVersion: 1,
        body: lifecycleEmailTemplate("welcome_registration", { fullName: "Ana Vega", race: "tu próxima carrera" }).body,
      });
    });

    it("a deleted account does not count: the code is issued", async () => {
      await createVersion();
      await pg.query(
        "INSERT INTO profiles(user_id,email,disabled_at,deleted_at) VALUES ('runner','ana@example.test',now(),now())",
      );
      const leadId = await seed();
      await claimAll();
      expect(await codes()).toHaveLength(1);
      expect((await welcomeOf(leadId)).templateVersion).toBe(2);
    });

    it("without an active version (none or inactive) no code is issued", async () => {
      const first = await seed({ destinationText: "Maratón de Lima" }, { form: "contact" });
      await claimAll();
      await createVersion(50, 60, false);
      const second = await seed({ destinationText: "Maratón de Lima" }, { form: "contact" });
      await claimAll();
      expect(await codes()).toEqual([]);
      for (const leadId of [first, second])
        expect(await welcomeOf(leadId)).toMatchObject({
          templateVersion: 1,
          body: noCodeBody("welcome_contact"),
        });
    });

    it.each([
      { source: "whatsapp", extra: {} },
      { source: "other", extra: {} },
      { source: "runner_account", extra: {} },
      { source: "import", extra: {} },
      { source: "web_form", extra: { bulk: true } },
    ])("$source $extra (manual entry, account or import): no code", async ({ source, extra }) => {
      await createVersion();
      const leadId = await seed({ source }, extra);
      await claimAll();
      expect(await codes()).toEqual([]);
      const rows = await pg.query<{ templateVersion: number; body: string }>(
        `SELECT template_version AS "templateVersion",body FROM client_emails WHERE lead_id=$1`,
        [leadId],
      );
      expect(rows.rows.length).toBeGreaterThan(0);
      for (const row of rows.rows) {
        expect(row.templateVersion).toBe(1);
        expect(row.body).not.toMatch(/CV-[23456789A-Z]{6}/);
      }
      expect(generateWelcomeCode).not.toHaveBeenCalled();
    });

    it("a skipped welcome (opt-out, no email) issues no code", async () => {
      await createVersion();
      await seed({ optedOut: true });
      await seed({ email: null });
      await claimAll();
      expect(await codes()).toEqual([]);
    });

    it("the same email reuses its code in force, in the same batch and in a later one", async () => {
      await createVersion();
      const first = await seed({}, { form: "registration" });
      const second = await seed({}, { form: "contact" });
      await claimAll();
      const third = await seed({}, { form: "registration" });
      await claimAll();
      const rows = await codes();
      expect(rows).toHaveLength(1);
      expect(rows[0].leadId).toBe(first);
      for (const leadId of [first, second, third])
        expect((await welcomeOf(leadId)).body).toContain(rows[0].code);
    });

    it("an expired code is not reused: a new one is issued", async () => {
      await createVersion();
      const first = await seed();
      await claimAll();
      await pg.query(
        "UPDATE welcome_discount_codes SET issued_at=now() - interval '70 days', expires_at=now() - interval '10 days'",
      );
      const second = await seed();
      await claimAll();
      const rows = await codes();
      expect(rows).toHaveLength(2);
      const fresh = rows.find((row) => row.leadId === second);
      const expired = rows.find((row) => row.leadId === first);
      expect(fresh?.code).not.toBe(expired?.code);
      expect((await welcomeOf(second)).body).toContain(fresh?.code);
      expect((await welcomeOf(second)).body).not.toContain(expired?.code);
    });

    it("an applied or void code of the same email is not reused", async () => {
      await createVersion();
      await existingCode("CV-ABCDEF", "ana@example.test");
      await pg.query("UPDATE welcome_discount_codes SET status='void'");
      const leadId = await seed();
      await claimAll();
      expect(await codes()).toHaveLength(2);
      expect((await welcomeOf(leadId)).body).not.toContain("CV-ABCDEF");
    });

    it("an event whose own code is no longer in force keeps it and gets the normal welcome", async () => {
      await createVersion();
      const leadId = await seed({ destinationText: "Maratón de Lima" }, { form: "contact" });
      const versionId = (await pg.query<{ id: string }>("SELECT id FROM welcome_discount_versions")).rows[0].id;
      await pg.query(
        `INSERT INTO welcome_discount_codes(lead_id,email,code,amount_usd,version_id,source_event_id,expires_at,status)
        VALUES ($1,'ana@example.test','CV-ABCDEF',50,$2,$3,now() + interval '30 days','void')`,
        [leadId, versionId, await eventOf(leadId)],
      );
      await claimAll();
      expect((await codes()).map((row) => row.code)).toEqual(["CV-ABCDEF"]);
      expect(await welcomeOf(leadId)).toMatchObject({
        templateVersion: 1,
        body: noCodeBody("welcome_contact"),
      });
    });

    it("concurrent preparations of the same event: a single code, and every rendering uses it", async () => {
      await createVersion();
      const leadId = await seed({}, { form: "registration" });
      const results = await Promise.all([claimAll(), claimAll(), claimAll()]);
      expect(results.flatMap((result) => result.messages)).toHaveLength(2);
      const rows = await codes();
      expect(rows).toHaveLength(1);
      expect((await welcomeOf(leadId)).body).toContain(rows[0].code);
      const rendered = vi
        .mocked(lifecycleEmailTemplate)
        .mock.calls.flatMap(([, data]) =>
          "welcomeCode" in data && data.welcomeCode ? [data.welcomeCode.code] : [],
        );
      expect(rendered.length).toBeGreaterThan(0);
      expect(new Set(rendered)).toEqual(new Set([rows[0].code]));
    });

    it("a preparation that loses the event rereads the stored code instead of its own", async () => {
      await createVersion();
      const leadId = await seed();
      const versionId = (await pg.query<{ id: string }>("SELECT id FROM welcome_discount_versions")).rows[0].id;
      // Another preparation stored the event's code after this one read the pending events.
      vi.mocked(generateWelcomeCode).mockImplementationOnce(() => {
        void pg.query(
          `INSERT INTO welcome_discount_codes(lead_id,email,code,amount_usd,version_id,source_event_id,expires_at)
          SELECT $1,'ana@example.test','CV-WNNER2',50,$2,id,now() + interval '60 days'
          FROM outbox_events WHERE lead_id=$1`,
          [leadId, versionId],
        );
        return "CV-LQSER2";
      });
      await claimAll();
      expect((await codes()).map((row) => row.code)).toEqual(["CV-WNNER2"]);
      expect((await welcomeOf(leadId)).body).toContain("CV-WNNER2");
    });

    it("retries when the generated code already exists, without reusing another email's code", async () => {
      await createVersion();
      await existingCode("CV-ABCDEF", "otra@example.test");
      vi.mocked(generateWelcomeCode).mockReturnValueOnce("CV-ABCDEF");
      const leadId = await seed();
      await claimAll();
      expect(generateWelcomeCode).toHaveBeenCalledTimes(2);
      const own = (await codes()).filter((row) => row.leadId === leadId);
      expect(own).toHaveLength(1);
      expect(own[0].code).not.toBe("CV-ABCDEF");
      expect(own[0].email).toBe("ana@example.test");
      const body = (await welcomeOf(leadId)).body;
      expect(body).toContain(own[0].code);
      expect(body).not.toContain("CV-ABCDEF");
    });

    it("gives up after repeated collisions with a fixed error and prepares nothing", async () => {
      await createVersion();
      await existingCode("CV-ABCDEF", "otra@example.test");
      vi.mocked(generateWelcomeCode).mockReturnValue("CV-ABCDEF");
      try {
        const leadId = await seed();
        const error = await claimAll().catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("welcome code: issue failed");
        expect(JSON.stringify(error)).not.toContain("CV-ABCDEF");
        expect(generateWelcomeCode).toHaveBeenCalledTimes(5);
        expect(await welcomeOf(leadId)).toBeUndefined();
      } finally {
        vi.mocked(generateWelcomeCode).mockReset();
        vi.mocked(generateWelcomeCode).mockImplementation(
          (await vi.importActual<typeof import("../utils/welcomeCode")>("../utils/welcomeCode"))
            .generateWelcomeCode,
        );
      }
    });

    it("the code never reaches the outbox nor the logs", async () => {
      await createVersion();
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        vi.spyOn(console, method).mockImplementation(() => undefined),
      );
      try {
        await seed({}, { form: "registration" });
        const { messages } = await claimAll();
        await authorizeAll(messages);
        const [{ code }] = await codes();
        const outbox = await pg.query<{ row: string }>("SELECT to_jsonb(e)::text AS row FROM outbox_events e");
        expect(outbox.rows.length).toBeGreaterThan(0);
        for (const { row } of outbox.rows) expect(row).not.toContain(code);
        for (const spy of spies)
          expect(JSON.stringify(spy.mock.calls)).not.toContain(code);
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });
  });

  describe("sales cadence", () => {
    const WHATSAPP = "https://wa.me/51938127170";
    const CREATED_AT = "2026-10-01T15:00:00Z";
    const offer: CadenceOffer = {
      finalPriceUsd: 1500,
      depositOptionsUsd: [300, 500],
      balanceDueOn: "2027-03-15",
      bonusDescription: "Polo oficial de la carrera",
      validUntil: "2999-12-31",
    };

    async function insertTrip(status = "published") {
      const result = await pg.query<{ id: string }>(
        `INSERT INTO trips(slug,title,city,country,race_date,distances,summary,status)
        VALUES ('maraton-lima','Maratón de Lima','Lima','PE','2027-05-16','{42K}','Resumen',$1::trip_status)
        RETURNING id`,
        [status],
      );
      return result.rows[0].id;
    }
    // An active, in-force offer version (general, or of a campaign of the trip).
    async function insertOffer(tripId: string, totalPriceUsd: number, campaignId: string | null = null) {
      await pg.query(
        `INSERT INTO trip_offers(trip_id,campaign_id,version,status,name,total_price_usd,discount_usd,
          deposit_options_usd,balance_due_on,bonus_description,valid_from,valid_until,terms_version,conditions,
          created_by,approved_by,approved_at,activated_by,activated_at)
        VALUES ($1,$2::uuid,1,'active','Oferta de prueba',$3,100,'{500,300}','2027-03-15',
          'Polo oficial de la carrera','2000-01-01','2999-12-31','terminos-v1','Condiciones de prueba',
          'staff','staff',now(),'staff',now())`,
        [tripId, campaignId, totalPriceUsd],
      );
    }
    async function insertCampaign(tripId: string, closed = false) {
      const result = await pg.query<{ id: string }>(
        `INSERT INTO campaigns(code,trip_id,channel,name,status,created_by,closed_at,closed_by)
        VALUES ('feria-lima',$1,'event','Feria de Lima',$2::campaign_status,'staff',
          CASE WHEN $3 THEN now() END,CASE WHEN $3 THEN 'staff' END)
        RETURNING id`,
        [tripId, closed ? "closed" : "active", closed],
      );
      return result.rows[0].id;
    }
    async function addActivity(
      leadId: string,
      type: string,
      at: string,
      stageFrom: string | null = null,
      stageTo: string | null = null,
    ) {
      const result = await pg.query<{ id: string }>(
        `INSERT INTO lead_activities(lead_id,type,stage_from,stage_to,actor_user_id,created_at)
        VALUES ($1,$2::lead_activity_type,$3::lead_stage,$4::lead_stage,'staff',$5) RETURNING id`,
        [leadId, type, stageFrom, stageTo, at],
      );
      return result.rows[0].id;
    }
    // Moves the lead to stageTo (activity + current stage), as the CRM does. Returns the new episode.
    async function changeStage(leadId: string, stageFrom: string, stageTo: string, at: string) {
      const episodeId = await addActivity(leadId, "stage_changed", at, stageFrom, stageTo);
      await pg.query("UPDATE leads SET stage=$2::lead_stage WHERE id=$1", [leadId, stageTo]);
      return episodeId;
    }
    // A lead in «new» (episode: its 'created' activity) or moved to «contacted»/«quoted» a day later
    // (episode: that stage_changed activity).
    async function cadenceLead(stage = "new", options: LeadOptions = {}) {
      const leadId = await insertLead({ destinationText: "Maratón de Lima", ...options });
      let episodeId = await addActivity(leadId, "created", CREATED_AT);
      if (stage !== "new")
        episodeId = await changeStage(leadId, "new", stage, "2026-10-02T15:00:00Z");
      return { leadId, episodeId };
    }
    const due = (leadId: string, payload: object) => addEvent("lead.cadence_due", leadId, payload);
    const tripUrl = `${APP_ORIGIN}/viajes/maraton-lima`;

    it("proposal with the in-force offer: price, deposit, balance, bonus, validity and links", async () => {
      const tripId = await insertTrip();
      await insertOffer(tripId, 1600);
      const { leadId, episodeId } = await cadenceLead("new", { tripId });
      await due(leadId, { stage: "new", step: "proposal", episodeId });
      const { messages } = await claimAll();
      const rows = await emails();
      const expected = cadenceEmailTemplate({
        stage: "new",
        step: "proposal",
        fullName: "Ana Vega",
        race: "Maratón de Lima",
        tripUrl,
        whatsappUrl: WHATSAPP,
        offer,
      });
      expect(rows).toMatchObject([
        {
          kind: "cadence_proposal",
          stage: "new",
          status: "claimed",
          recipient: "ana@example.test",
          subject: "Tu propuesta para Maratón de Lima",
          body: expected.body,
        },
      ]);
      for (const fragment of [
        "Precio final: US$1,500.",
        "Puedes separar tu cupo con US$300 y completar el saldo hasta el 15 de marzo de 2027.",
        "Polo oficial de la carrera.",
        "Esta oferta es válida hasta el 31 de diciembre de 2999.",
        tripUrl,
        WHATSAPP,
      ])
        expect(rows[0].body).toContain(fragment);
      expect(await authorizeAll(messages)).toEqual({ cadence_proposal: "authorized" });
    });

    it.each([
      ["active", "US$1,300"],
      ["closed", "US$1,500"],
    ] as const)("uses the lead's campaign offer while the campaign is %s, else the general one", async (status, price) => {
      const tripId = await insertTrip();
      const campaignId = await insertCampaign(tripId, status === "closed");
      await insertOffer(tripId, 1600);
      await insertOffer(tripId, 1400, campaignId);
      const { leadId, episodeId } = await cadenceLead("new", { tripId, campaignId });
      await due(leadId, { stage: "new", step: "proposal", episodeId });
      await claimAll();
      expect((await emails())[0].body).toContain(`Precio final: ${price}.`);
    });

    it("proposal without an in-force offer uses the variant without price", async () => {
      const tripId = await insertTrip();
      const { leadId, episodeId } = await cadenceLead("new", { tripId });
      await due(leadId, { stage: "new", step: "proposal", episodeId });
      await claimAll();
      const [row] = await emails();
      expect(row).toMatchObject({ kind: "cadence_proposal", status: "claimed" });
      expect(row.body).toBe(
        cadenceEmailTemplate({
          stage: "new",
          step: "proposal",
          fullName: "Ana Vega",
          race: "Maratón de Lima",
          tripUrl,
          whatsappUrl: WHATSAPP,
          offer: null,
        }).body,
      );
      expect(row.body).not.toContain("Precio final");
    });

    it("a trip that is not published gives no trip link and no offer", async () => {
      const tripId = await insertTrip("draft");
      await insertOffer(tripId, 1600);
      const { leadId, episodeId } = await cadenceLead("new", { tripId });
      await due(leadId, { stage: "new", step: "proposal", episodeId });
      await claimAll();
      const [row] = await emails();
      expect(row.body).toBe(
        cadenceEmailTemplate({
          stage: "new",
          step: "proposal",
          fullName: "Ana Vega",
          race: "Maratón de Lima",
          tripUrl: null,
          whatsappUrl: WHATSAPP,
          offer: null,
        }).body,
      );
      expect(row.body).not.toContain("/viajes/");
      expect(row.body).not.toContain("Precio final");
    });

    it.each([
      ["contacted", "r3", "Sobre tu viaje a Maratón de Lima"],
      ["quoted", "r5", "Separa tu cupo para Maratón de Lima"],
      ["new", "r7", "¿Seguimos con Maratón de Lima?"],
    ] as const)("%s %s: reminder with the stage's own text", async (stage, step, subject) => {
      const tripId = await insertTrip();
      await insertOffer(tripId, 1600);
      const { leadId, episodeId } = await cadenceLead(stage, { stage, tripId });
      await due(leadId, { stage, step, episodeId });
      const { messages } = await claimAll();
      const rows = await emails();
      expect(rows).toMatchObject([
        {
          kind: "cadence_reminder",
          stage,
          status: "claimed",
          recipient: "ana@example.test",
          subject,
          body: cadenceEmailTemplate({
            stage,
            step,
            fullName: "Ana Vega",
            race: "Maratón de Lima",
            tripUrl,
            whatsappUrl: WHATSAPP,
            offer: null,
          }).body,
        },
      ]);
      expect(rows[0].body).not.toContain("Precio final");
      expect(await authorizeAll(messages)).toEqual({ cadence_reminder: "authorized" });
    });

    it("a superseded step is recorded as skipped and never claimed", async () => {
      const { leadId, episodeId } = await cadenceLead("contacted", { stage: "contacted" });
      await due(leadId, { stage: "contacted", step: "r3", episodeId, superseded: true });
      await due(leadId, { stage: "contacted", step: "r5", episodeId });
      expect((await claimAll()).messages).toHaveLength(1);
      expect(await summary()).toEqual([
        { kind: "cadence_reminder", status: "skipped", lastErrorCode: "superseded" },
        { kind: "cadence_reminder", status: "claimed", lastErrorCode: null },
      ]);
    });

    it.each([
      ["the proposal outside «new»", { stage: "contacted", step: "proposal" }],
      ["an unknown stage", { stage: "reserved", step: "r3" }],
      ["an unknown step", { stage: "new", step: "r9" }],
      ["an invalid episode id", { stage: "new", step: "r3", episodeId: "not-a-uuid" }],
      ["a non-boolean superseded", { stage: "new", step: "r3", superseded: "yes" }],
    ])("ignores an invalid payload: %s", async (_, payload) => {
      const { leadId, episodeId } = await cadenceLead("new");
      await due(leadId, { episodeId, ...payload });
      expect((await claimAll()).messages).toEqual([]);
      expect(await emails()).toEqual([]);
    });

    // Changes applied between queuing and preparing (before) or between preparing and SMTP (after).
    const phases = ["before preparing", "before SMTP"] as const;
    async function expectStopped(
      leadId: string,
      phase: (typeof phases)[number],
      change: () => Promise<unknown>,
      code: string,
    ) {
      if (phase === "before preparing") {
        await change();
        expect((await claimAll()).messages).toEqual([]);
      } else {
        const { messages } = await claimAll();
        expect(messages).toHaveLength(1);
        await change();
        expect(await authorizeAll(messages)).toEqual({ cadence_reminder: "skipped" });
      }
      expect(await summary()).toEqual([
        { kind: "cadence_reminder", status: "skipped", lastErrorCode: code },
      ]);
      expect(leadId).toBeTruthy();
    }

    it.each(phases)("a stage change %s leaves the step obsolete", async (phase) => {
      const { leadId, episodeId } = await cadenceLead("contacted", { stage: "contacted" });
      await due(leadId, { stage: "contacted", step: "r3", episodeId });
      await expectStopped(
        leadId,
        phase,
        () => changeStage(leadId, "contacted", "quoted", "2026-10-05T15:00:00Z"),
        "obsolete_event",
      );
    });

    it.each(phases)("a reopened stage episode %s leaves the old episode's step obsolete", async (phase) => {
      const { leadId, episodeId } = await cadenceLead("contacted", { stage: "contacted" });
      await due(leadId, { stage: "contacted", step: "r3", episodeId });
      await expectStopped(
        leadId,
        phase,
        async () => {
          await changeStage(leadId, "contacted", "quoted", "2026-10-05T15:00:00Z");
          await changeStage(leadId, "quoted", "contacted", "2026-10-06T15:00:00Z");
        },
        "obsolete_event",
      );
    });

    it.each(phases)("«Respondió» %s stops the step", async (phase) => {
      const { leadId, episodeId } = await cadenceLead("contacted", { stage: "contacted" });
      await due(leadId, { stage: "contacted", step: "r3", episodeId });
      await expectStopped(
        leadId,
        phase,
        () => addActivity(leadId, "responded", "2026-10-04T15:00:00Z"),
        "responded",
      );
    });

    it.each(phases)("an opt-out %s stops the step", async (phase) => {
      const { leadId, episodeId } = await cadenceLead("contacted", { stage: "contacted" });
      await due(leadId, { stage: "contacted", step: "r3", episodeId });
      await expectStopped(
        leadId,
        phase,
        () => pg.query("UPDATE leads SET contact_opt_out_at=now() WHERE id=$1", [leadId]),
        "opted_out",
      );
    });

    it.each(phases)("archiving the lead %s stops the step", async (phase) => {
      const { leadId, episodeId } = await cadenceLead("contacted", { stage: "contacted" });
      await due(leadId, { stage: "contacted", step: "r3", episodeId });
      await expectStopped(
        leadId,
        phase,
        () => pg.query("UPDATE leads SET archived_at=now(),archived_by='staff' WHERE id=$1", [leadId]),
        "archived",
      );
    });

    it("a «Respondió» of an earlier episode does not stop the current one", async () => {
      const { leadId } = await cadenceLead("contacted", { stage: "contacted" });
      await addActivity(leadId, "responded", "2026-10-03T15:00:00Z");
      await changeStage(leadId, "contacted", "quoted", "2026-10-05T15:00:00Z");
      const episodeId = await changeStage(leadId, "quoted", "contacted", "2026-10-06T15:00:00Z");
      await due(leadId, { stage: "contacted", step: "r3", episodeId });
      const { messages } = await claimAll();
      expect(await authorizeAll(messages)).toEqual({ cadence_reminder: "authorized" });
    });

    it("skips a lead without email and an episode that started before the cutoff", async () => {
      const noEmail = await cadenceLead("new", { email: null });
      await due(noEmail.leadId, { stage: "new", step: "r3", episodeId: noEmail.episodeId });
      expect((await claimAll()).messages).toEqual([]);
      // The episode started on CREATED_AT; the event was queued after the new cutoff.
      const early = await cadenceLead("new", { email: "early@example.test" });
      await due(early.leadId, { stage: "new", step: "r3", episodeId: early.episodeId });
      env.startAt = new Date("2026-10-15T00:00:00Z");
      await pg.query("UPDATE outbox_events SET created_at='2026-10-16T15:00:00Z' WHERE lead_id=$1", [
        early.leadId,
      ]);
      expect((await claimAll()).messages).toEqual([]);
      expect(await summary()).toEqual([
        { kind: "cadence_reminder", status: "skipped", lastErrorCode: "missing_email" },
        { kind: "cadence_reminder", status: "skipped", lastErrorCode: "ineligible" },
      ]);
    });

    describe("with the sales cadence switch off (CRM_SALES_CADENCE_ENABLED, until Phase 2)", () => {
      it("records the cadence emails as skipped at preparation, while the welcome is still sent", async () => {
        const tripId = await insertTrip();
        await insertOffer(tripId, 1600);
        const { leadId, episodeId } = await cadenceLead("new", { tripId });
        await addEvent("lead.created", leadId, { source: "web_form" });
        await due(leadId, { stage: "new", step: "proposal", episodeId });
        await due(leadId, { stage: "new", step: "r3", episodeId });
        vi.mocked(isSalesCadenceEnabled).mockReturnValue(false);
        const { messages } = await claimAll();
        expect(await authorizeAll(messages)).toEqual({
          welcome_contact: "authorized",
          team_alert: "authorized",
        });
        expect((await summary()).filter((row) => row.kind.startsWith("cadence_"))).toEqual([
          { kind: "cadence_proposal", status: "skipped", lastErrorCode: "ineligible" },
          { kind: "cadence_reminder", status: "skipped", lastErrorCode: "ineligible" },
        ]);
      });

      it("rejects a claimed cadence email just before SMTP when the switch is turned off", async () => {
        const { leadId, episodeId } = await cadenceLead("contacted", { stage: "contacted" });
        await due(leadId, { stage: "contacted", step: "r3", episodeId });
        const { messages } = await claimAll();
        expect(messages).toHaveLength(1);
        vi.mocked(isSalesCadenceEnabled).mockReturnValue(false);
        expect(await authorizeAll(messages)).toEqual({ cadence_reminder: "skipped" });
        expect(await summary()).toEqual([
          { kind: "cadence_reminder", status: "skipped", lastErrorCode: "ineligible" },
        ]);
      });

      it("rejects the retry of a cadence email", async () => {
        const { leadId, episodeId } = await cadenceLead("quoted", { stage: "quoted" });
        await due(leadId, { stage: "quoted", step: "r5", episodeId });
        const [message] = (await claimAll()).messages;
        await failClientEmail(message.id, message.attemptToken, "before_send");
        vi.mocked(isSalesCadenceEnabled).mockReturnValue(false);
        expect(await retryClientEmail(message.id, "staff")).toBeNull();
        vi.mocked(isSalesCadenceEnabled).mockReturnValue(true);
        expect(await retryClientEmail(message.id, "staff")).toBe(leadId);
      });
    });

    it("a retry rechecks the cadence eligibility", async () => {
      const { leadId, episodeId } = await cadenceLead("quoted", { stage: "quoted" });
      await due(leadId, { stage: "quoted", step: "r7", episodeId });
      const [message] = (await claimAll()).messages;
      await failClientEmail(message.id, message.attemptToken, "before_send");
      expect(await retryClientEmail(message.id, "staff")).toBe(leadId);
      const [next] = (await claimAll()).messages;
      await failClientEmail(next.id, next.attemptToken, "before_send");
      await addActivity(leadId, "responded", "2026-10-04T15:00:00Z");
      expect(await retryClientEmail(next.id, "staff")).toBeNull();
    });
  });

  it("legacy stage rows keep working: claim, fail, retry, authorize and ack", async () => {
    const leadId = await insertLead();
    const eventId = await addEvent("lead.created", leadId, { source: "web_form" });
    const { subject, body } = clientEmailTemplate("new", "Ana Vega");
    // A row written before the kind column existed: no kind, so the column default applies.
    await pg.query(
      `INSERT INTO client_emails(source_event_id,lead_id,stage,recipient,sender,subject,body)
      VALUES ($1,$2,'new','ana@example.test','sender@example.test',$3,$4)`,
      [eventId, leadId, subject, body],
    );
    const original = (await claimAll()).messages;
    expect(original).toHaveLength(1);
    expect(await summary()).toEqual([
      { kind: "stage", status: "claimed", lastErrorCode: null },
    ]);
    await failClientEmail(original[0].id, original[0].attemptToken, "before_send");
    expect(await retryClientEmail(original[0].id, "staff")).toBe(leadId);
    const next = (await claimAll()).messages[0];
    expect(await authorizeClientEmail(next.id, next.attemptToken)).toMatchObject({
      status: "authorized",
      message: { to: "ana@example.test", subject, text: body },
    });
    expect(await ackClientEmail(next.id, next.attemptToken, "smtp-1")).toMatchObject({
      status: "sent",
    });
    expect(await summary()).toEqual([
      { kind: "stage", status: "sent", lastErrorCode: null },
    ]);
  });

  it.each(["opted_out", "archived", "recipient_changed", "stage_changed"])(
    "rechecks %s for a stage email immediately before sending",
    async (change) => {
      const leadId = await seedStage();
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
    await seedStage();
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
    const leadId = await seedStage();
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
    await seedStage();
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
      payload: { source: "web_form" },
      fullName: "Ana Vega",
      email: "ana@example.test",
      currentStage: "new",
      source: "web_form",
      archived: false,
      optedOut: false,
      current: true,
      tripTitle: null,
      destinationText: "Maratón de Lima",
      bookingTripTitle: null,
      ownerEmail: null,
      latestOwnerAssignment: true,
      currentOwnerEmail: null,
      tripId: null,
      campaignId: null,
      publishedTripSlug: null,
      episodeCurrent: null,
      responded: null,
      episodeAfterCutoff: null,
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
    expect(insert.sql).toMatch(/on conflict \("source_event_id","kind"\) do nothing/);
    for (const value of [
      "pending",
      "skipped",
      "opted_out",
      "welcome_contact",
      "team_alert",
      "ana@example.test",
      "team@example.test",
    ])
      expect(insert.params).toContain(value);
    expect(insert.params).not.toContain("stage");
    expect(insert.params).toContain(
      lifecycleEmailTemplate("welcome_contact", {
        fullName: "Ana Vega",
        race: "Maratón de Lima",
      }).body,
    );
    expect(insert.params).not.toContain(
      clientEmailTemplate("new", "Ana Vega").body,
    );
    expect(insert.params.join("\n")).toContain(
      `${APP_ORIGIN}/crm/leads/${id}`,
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
