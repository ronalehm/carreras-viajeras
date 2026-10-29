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
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/env", () => ({ getClientEmailEnv: vi.fn() }));
import { getDb } from "@/lib/db";
import { getClientEmailEnv } from "@/lib/env";
import { createEmbeddedDb } from "@/lib/testing/embeddedDb";
import { getLeadPipeline } from "./leads.service";
import { getLeadMessages } from "./leadMessages.service";
const id = "a0000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
});
function fake(rows: unknown[] = []) {
  const query = vi.fn(async () => ({ rows }));
  vi.mocked(getDb).mockReturnValue(
    drizzle(query as never) as ReturnType<typeof getDb>,
  );
  return query;
}
describe("getLeadMessages", () => {
  it("does not query invalid contact IDs", async () => {
    expect(await getLeadMessages("invalid")).toEqual({
      messages: [],
      automation: "disabled",
    });
    expect(getDb).not.toHaveBeenCalled();
  });
  it("keeps history readable when disabled, and never offers a retry", async () => {
    vi.mocked(getClientEmailEnv).mockReturnValue(null);
    const query = fake([
      {
        id,
        stage: "new",
        status: "sent",
        createdAt: "2026-10-29T00:00:00Z",
        updatedAt: "2026-10-29T00:01:00Z",
        sentAt: "2026-10-29T00:01:00Z",
        canRetry: false,
        currentEpisode: true,
      },
    ]);
    const result = await getLeadMessages(id);
    expect(result.automation).toBe("disabled");
    expect(result.messages[0].sentAt).toBeInstanceOf(Date);
    expect(query.mock.calls[0]).toBeDefined();
  });
  it("bounds retry eligibility by the current episode, sender, contact preferences and cutoff", async () => {
    vi.mocked(getClientEmailEnv).mockReturnValue({
      from: "sender@example.test",
      startAt: new Date("2026-10-29T00:00:00Z"),
    });
    const query = fake();
    expect((await getLeadMessages(id)).automation).toBe("enabled");
    const [statement, params] = (
      query.mock.calls as unknown as [string, unknown[]][]
    )[0];
    for (const fragment of [
      "m.attempts < 3",
      "l.contact_opt_out_at IS NULL",
      "m.last_error_code = 'pre_send_failed'",
      "newer.sequence > e.sequence",
    ])
      expect(statement).toContain(fragment);
    expect(params).toContain(id);
  });
  it("shows an invalid configuration as an operational notice without exposing the error", async () => {
    vi.mocked(getClientEmailEnv).mockImplementation(() => {
      throw new Error("sensitive");
    });
    fake();
    expect(await getLeadMessages(id)).toEqual({
      automation: "invalid",
      messages: [],
    });
  });
});

describe("pipeline and messages against PostgreSQL", () => {
  let embedded: Awaited<ReturnType<typeof createEmbeddedDb>>;
  beforeAll(async () => {
    embedded = await createEmbeddedDb();
  }, 30000);
  afterAll(async () => {
    await embedded?.pg.close();
  });
  beforeEach(async () => {
    await embedded.pg.exec("TRUNCATE leads, profiles RESTART IDENTITY CASCADE");
    vi.mocked(getDb).mockReturnValue(embedded.db as ReturnType<typeof getDb>);
    vi.mocked(getClientEmailEnv).mockReturnValue({
      from: "sender@example.test",
      startAt: new Date("2000-01-01T00:00:00Z"),
    });
  });
  it("reads ten contacts independently per stage with complete totals beyond a single global page", async () => {
    await embedded.pg
      .exec(`INSERT INTO leads(full_name,phone,email,source,consent_version,stage,lost_reason)
      SELECT 'Contacto ' || n, '+51938127170', 'contact@example.test', 'web_form', 'test-v1', stage,
        CASE WHEN stage='lost' THEN 'Cambió sus fechas' ELSE NULL END
      FROM generate_series(1,12) n CROSS JOIN unnest(enum_range(NULL::lead_stage)) stage`);
    const board = await getLeadPipeline({ page: 99 }, "staff", "2026-10-29");
    expect(board.columns).toHaveLength(6);
    for (const column of board.columns) {
      expect(column.total).toBe(12);
      expect(column.leads).toHaveLength(10);
      expect(column.leads.every((lead) => lead.stage === column.stage)).toBe(
        true,
      );
      expect(column.leads[0].emailStatus).toBeNull();
    }
  });
  it("does not attribute or retry an old same-stage email after the contact reopens", async () => {
    await embedded.pg.query(
      "INSERT INTO leads(id,full_name,phone,email,source,consent_version) VALUES ($1,'Ana Vega','+51938127170','ana@example.test','web_form','test-v1')",
      [id],
    );
    const event = await embedded.pg.query<{ id: string }>(
      "INSERT INTO outbox_events(type,lead_id,payload) VALUES ('lead.created',$1,'{}') RETURNING id",
      [id],
    );
    await embedded.pg.query(
      `INSERT INTO client_emails(source_event_id,lead_id,stage,recipient,sender,subject,body,status,last_error_code,attempts)
      VALUES ($1,$2,'new','ana@example.test','sender@example.test','Viaje','Hola Ana','failed','pre_send_failed',1)`,
      [event.rows[0].id, id],
    );
    let history = await getLeadMessages(id);
    expect(history.messages[0]).toMatchObject({
      stage: "new",
      canRetry: true,
      currentEpisode: true,
      createdAt: expect.any(Date),
    });
    let board = await getLeadPipeline({ page: 1 }, "staff", "2026-10-29");
    expect(board.columns[0].leads[0].emailStatus).toMatchObject({
      stage: "new",
      status: "failed",
    });
    await embedded.pg.query(
      'INSERT INTO outbox_events(type,lead_id,payload) VALUES (\'lead.stage_changed\',$1,\'{"stageFrom":"reserved","stageTo":"new"}\')',
      [id],
    );
    history = await getLeadMessages(id);
    expect(history.messages[0]).toMatchObject({
      canRetry: false,
      currentEpisode: false,
    });
    board = await getLeadPipeline({ page: 1 }, "staff", "2026-10-29");
    expect(board.columns[0].leads[0].emailStatus).toBeNull();
  });
});
