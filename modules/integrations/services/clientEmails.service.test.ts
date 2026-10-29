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
  getEnv: vi.fn(() => ({ APP_ORIGIN: "https://carreras-viajeras.mentec.dev" })),
}));
import { getDb } from "@/lib/db";
import { getClientEmailEnv } from "@/lib/env";
import { lifecycleEmailTemplate } from "../utils/lifecycleEmailTemplates";
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
  };
  // Manual sources need an author (leads_created_by_chk); system sources have none.
  async function insertLead(options: LeadOptions = {}) {
    const source = options.source ?? "web_form";
    const result = await pg.query<{ id: string }>(
      `INSERT INTO leads(full_name,phone,email,source,consent_version,contact_opt_out_at,stage,trip_id,
        destination_text,owner_user_id,next_action_date,next_action_note,created_by)
      VALUES ('Ana Vega','+51938127170',$1,$2::lead_source,'test-v1',CASE WHEN $3 THEN now() ELSE NULL END,
        $4::lead_stage,$5::uuid,$6,$7,$8::date,$9,$10) RETURNING id`,
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

    it.each([
      ["the stage changed", { stage: "quoted", nextActionDate: "2000-01-01" }, false],
      ["the next action is no longer due", { stage: "contacted", nextActionDate: "2999-01-01" }, false],
      ["the next action was cleared", { stage: "contacted", nextActionDate: null }, false],
      ["a later stage event exists", { stage: "contacted", nextActionDate: "2000-01-01" }, true],
    ] as const)(
      "skips follow_up at preparation when %s",
      async (_, lead, laterEvent) => {
        const leadId = await insertLead(lead);
        await addEvent("lead.follow_up_due", leadId, { stage: "contacted", dueOn: "2000-01-01" });
        if (laterEvent)
          await addEvent("lead.stage_changed", leadId, { stageFrom: "contacted", stageTo: "contacted" });
        await claimAll();
        expect((await summary()).find((row) => row.kind === "follow_up")).toEqual({
          kind: "follow_up",
          status: "skipped",
          lastErrorCode: "obsolete_event",
        });
      },
    );

    it.each([
      ["nothing changed", null, "authorized"],
      ["the stage changed", "UPDATE leads SET stage='quoted' WHERE id=$1", "skipped"],
      ["the next action moved", "UPDATE leads SET next_action_date='2999-01-01' WHERE id=$1", "skipped"],
    ] as const)(
      "rechecks follow_up before SMTP when %s",
      async (_, change, expected) => {
        const leadId = await insertLead({
          stage: "contacted",
          nextActionDate: "2000-01-01",
          destinationText: "Maratón de Lima",
        });
        await addEvent("lead.follow_up_due", leadId, { stage: "contacted", dueOn: "2000-01-01" });
        const { messages } = await claimAll();
        expect(await emails()).toMatchObject([
          {
            kind: "follow_up",
            stage: "contacted",
            status: "claimed",
            subject: "¿Seguimos con tu viaje a Maratón de Lima?",
          },
        ]);
        if (change) await pg.query(change, [leadId]);
        expect(await authorizeAll(messages)).toEqual({ follow_up: expected });
      },
    );

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
      followUpDue: false,
      tripTitle: null,
      destinationText: "Maratón de Lima",
      bookingTripTitle: null,
      ownerEmail: null,
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
