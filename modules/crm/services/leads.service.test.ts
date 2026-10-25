// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import type { CreateLeadInput, UpdateLeadInput } from "../types/leads.types";
import {
  archiveLead,
  changeLeadOwner,
  changeLeadStage,
  createLead,
  getLeadById,
  getLeadFormOptions,
  getLeadList,
  optOutLead,
  setNextAction,
  updateLead,
} from "./leads.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client: records every statement and answers each one, in order, with the given rows.
function useFakeDb({ responses = [] as unknown[][], failWith }: { responses?: unknown[][]; failWith?: Error } = {}) {
  const queries: Query[] = [];
  const query = vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ sql: text, params });
    if (failWith) throw failWith;
    return { rows: responses[queries.length - 1] ?? [] };
  });
  const transaction = vi.fn((pending: Promise<unknown>[]) => Promise.all(pending));
  const client = Object.assign(query, { transaction });
  vi.mocked(getDb).mockReturnValue(drizzle(client as never) as ReturnType<typeof getDb>);
  return { queries, transaction };
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const TRIP_ID = "8a6e0804-2bd0-4672-b79d-d97027f9071a";
const LEAD_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const TODAY = "2026-10-18";
const ACTIVE_OWNER_ROLES = '"staff_assignments"."revoked_at" is null and "staff_assignments"."role" in ($1, $2)';

// List row in select order (array mode): id, full_name, phone, stage, source, channel,
// trip id/title, destination_text, owner user_id/email/active, next_action_date/note.
function listRow(index: number, overrides: unknown[] = []) {
  const row = [
    `lead-${index}`,
    `Lead ${index}`,
    "+51938127170",
    "new",
    "whatsapp",
    "whatsapp",
    null,
    null,
    null,
    "user-1",
    "ana@example.com",
    true,
    null,
    null,
  ];
  overrides.forEach((value, position) => {
    if (value !== undefined) row[position] = value as never;
  });
  return row;
}

beforeEach(() => vi.mocked(getDb).mockReset());

describe("getLeadList", () => {
  it("reads the page, the funnel counts and the owner options in one batch", async () => {
    const fake = useFakeDb();
    await getLeadList({ page: 1 }, "user-1", TODAY);

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(3);
    const [list, counts, owners] = fake.queries.map((query) => normalize(query.sql));

    expect(list).toMatch(
      /^select "leads"\."id", .* from "leads" left join "profiles" on "profiles"\."user_id" = "leads"\."owner_user_id" left join "trips" on "trips"\."id" = "leads"\."trip_id"/,
    );
    expect(list).toContain(
      `exists (select 1 from "staff_assignments" where ("staff_assignments"."user_id" = "leads"."owner_user_id" and (${ACTIVE_OWNER_ROLES})))`,
    );
    expect(list).toContain('where "leads"."archived_at" is null order by "leads"."created_at" desc, "leads"."id" desc limit $3');
    expect(list).not.toContain("offset");
    expect(fake.queries[0].params).toEqual(["commercial", "admin", 26]);

    expect(counts).toBe(
      'select "stage", count(*) from "leads" where "leads"."archived_at" is null group by "leads"."stage"',
    );
    expect(owners).toBe(
      `select distinct "profiles"."user_id", "profiles"."email" from "staff_assignments" inner join "profiles" on "profiles"."user_id" = "staff_assignments"."user_id" where (${ACTIVE_OWNER_ROLES}) order by "profiles"."email" asc, "profiles"."user_id" asc`,
    );
  });

  it("applies stage, mine (session user) and the page offset; counts ignore the stage", async () => {
    const fake = useFakeDb();
    await getLeadList({ stage: "quoted", owner: "mine", page: 3 }, "user-1", TODAY);

    const [list, counts] = fake.queries;
    expect(normalize(list.sql)).toContain(
      'where (("leads"."archived_at" is null and "leads"."owner_user_id" = $3) and "leads"."stage" = $4) order by "leads"."created_at" desc, "leads"."id" desc limit $5 offset $6',
    );
    expect(list.params).toEqual(["commercial", "admin", "user-1", "quoted", 26, 50]);
    expect(normalize(counts.sql)).toBe(
      'select "stage", count(*) from "leads" where ("leads"."archived_at" is null and "leads"."owner_user_id" = $1) group by "leads"."stage"',
    );
    expect(counts.params).toEqual(["user-1"]);
  });

  it("filters by a specific owner id", async () => {
    const fake = useFakeDb();
    await getLeadList({ owner: "user-7", page: 1 }, "user-1", TODAY);

    expect(fake.queries[0].params).toEqual(["commercial", "admin", "user-7", 26]);
    expect(fake.queries[1].params).toEqual(["user-7"]);
  });

  it("filters unassigned leads (owner_user_id is null) in the list and in the funnel counts", async () => {
    const fake = useFakeDb();
    await getLeadList({ stage: "new", owner: "unassigned", page: 1 }, "user-1", TODAY);

    const [list, counts] = fake.queries;
    expect(normalize(list.sql)).toContain(
      'where (("leads"."archived_at" is null and "leads"."owner_user_id" is null) and "leads"."stage" = $3) order by "leads"."created_at" desc, "leads"."id" desc limit $4',
    );
    expect(list.params).toEqual(["commercial", "admin", "new", 26]);
    expect(normalize(counts.sql)).toBe(
      'select "stage", count(*) from "leads" where ("leads"."archived_at" is null and "leads"."owner_user_id" is null) group by "leads"."stage"',
    );
    expect(counts.params).toEqual([]);
  });

  it("selects the channel next to the source", async () => {
    const fake = useFakeDb();
    await getLeadList({ page: 1 }, "user-1", TODAY);
    expect(normalize(fake.queries[0].sql)).toContain('"leads"."source", "leads"."channel", "trips"."id"');
  });

  it("filters by channel in the list and in the funnel counts, in the same batch", async () => {
    const fake = useFakeDb();
    await getLeadList({ stage: "new", owner: "unassigned", channel: "event", page: 1 }, "user-1", TODAY);

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.queries).toHaveLength(3);
    const [list, counts] = fake.queries;
    expect(normalize(list.sql)).toContain(
      'where (("leads"."archived_at" is null and "leads"."owner_user_id" is null and "leads"."channel" = $3) and "leads"."stage" = $4) order by "leads"."created_at" desc, "leads"."id" desc limit $5',
    );
    expect(list.params).toEqual(["commercial", "admin", "event", "new", 26]);
    expect(normalize(counts.sql)).toBe(
      'select "stage", count(*) from "leads" where ("leads"."archived_at" is null and "leads"."owner_user_id" is null and "leads"."channel" = $1) group by "leads"."stage"',
    );
    expect(counts.params).toEqual(["event"]);
  });

  it("archived with a channel: the list and the funnel counts both apply it", async () => {
    const fake = useFakeDb();
    await getLeadList({ stage: "archived", channel: "instagram", page: 1 }, "user-1", TODAY);

    const [list, counts] = fake.queries;
    expect(normalize(list.sql)).toContain(
      'where ("leads"."archived_at" is not null and "leads"."channel" = $3) order by "leads"."created_at" desc, "leads"."id" desc limit $4',
    );
    expect(list.params).toEqual(["commercial", "admin", "instagram", 26]);
    expect(normalize(counts.sql)).toBe(
      'select "stage", count(*) from "leads" where ("leads"."archived_at" is null and "leads"."channel" = $1) group by "leads"."stage"',
    );
    expect(counts.params).toEqual(["instagram"]);
  });

  it("selects the next action date and note", async () => {
    const fake = useFakeDb();
    await getLeadList({ page: 1 }, "user-1", TODAY);
    expect(normalize(fake.queries[0].sql)).toContain(
      '"leads"."next_action_date", "leads"."next_action_note" from "leads"',
    );
  });

  it("overdue: open leads with a next action before today, oldest first; the counts apply it too", async () => {
    const fake = useFakeDb();
    await getLeadList({ followUp: "overdue", page: 1 }, "user-1", TODAY);

    const [list, counts] = fake.queries;
    const visible =
      '"leads"."archived_at" is null and ("leads"."stage" not in ($3, $4) and "leads"."next_action_date" < $5)';
    expect(normalize(list.sql)).toContain(
      `where (${visible}) order by "leads"."next_action_date" asc, "leads"."created_at" desc, "leads"."id" desc limit $6`,
    );
    expect(list.params).toEqual(["commercial", "admin", "paid", "lost", TODAY, 26]);
    expect(normalize(counts.sql)).toBe(
      'select "stage", count(*) from "leads" where ("leads"."archived_at" is null and ("leads"."stage" not in ($1, $2) and "leads"."next_action_date" < $3)) group by "leads"."stage"',
    );
    expect(counts.params).toEqual(["paid", "lost", TODAY]);
  });

  it("pending (mine): includes today's next actions (<=) and combines with owner, stage and page", async () => {
    const fake = useFakeDb();
    await getLeadList({ stage: "quoted", owner: "mine", followUp: "pending", page: 2 }, "user-1", "2026-10-19");

    const [list, counts] = fake.queries;
    expect(normalize(list.sql)).toContain(
      'where (("leads"."archived_at" is null and "leads"."owner_user_id" = $3 and ("leads"."stage" not in ($4, $5) and "leads"."next_action_date" <= $6)) and "leads"."stage" = $7) order by "leads"."next_action_date" asc, "leads"."created_at" desc, "leads"."id" desc limit $8 offset $9',
    );
    expect(list.params).toEqual(["commercial", "admin", "user-1", "paid", "lost", "2026-10-19", "quoted", 26, 25]);
    expect(counts.params).toEqual(["user-1", "paid", "lost", "2026-10-19"]);
  });

  it("without a follow-up filter ignores today and keeps the newest first", async () => {
    const fake = useFakeDb();
    await getLeadList({ page: 1 }, "user-1", TODAY);
    expect(normalize(fake.queries[0].sql)).not.toContain('"next_action_date" <');
    expect(normalize(fake.queries[0].sql)).toContain('order by "leads"."created_at" desc, "leads"."id" desc');
    expect(fake.queries[0].params).not.toContain(TODAY);
  });

  it("archived: lists only archived leads of any stage; the funnel still counts non-archived leads", async () => {
    const fake = useFakeDb();
    await getLeadList({ stage: "archived", owner: "mine", page: 2 }, "user-1", TODAY);

    const [list, counts] = fake.queries;
    expect(normalize(list.sql)).toContain(
      'where ("leads"."archived_at" is not null and "leads"."owner_user_id" = $3) order by "leads"."created_at" desc, "leads"."id" desc limit $4 offset $5',
    );
    expect(normalize(list.sql)).not.toContain('"leads"."stage" =');
    expect(list.params).toEqual(["commercial", "admin", "user-1", 26, 25]);
    expect(list.params).not.toContain("archived");
    expect(normalize(counts.sql)).toBe(
      'select "stage", count(*) from "leads" where ("leads"."archived_at" is null and "leads"."owner_user_id" = $1) group by "leads"."stage"',
    );
    expect(counts.params).toEqual(["user-1"]);
  });

  it("archived without other filters: archived_at is not null only", async () => {
    const fake = useFakeDb();
    await getLeadList({ stage: "archived", page: 1 }, "user-1", TODAY);

    expect(normalize(fake.queries[0].sql)).toContain(
      'where "leads"."archived_at" is not null order by "leads"."created_at" desc, "leads"."id" desc limit $3',
    );
    expect(normalize(fake.queries[1].sql)).toBe(
      'select "stage", count(*) from "leads" where "leads"."archived_at" is null group by "leads"."stage"',
    );
  });

  it("returns 25 leads and hasNextPage when the database returns 26 rows", async () => {
    const rows = Array.from({ length: 26 }, (_, index) => listRow(index));
    useFakeDb({ responses: [rows, [], []] });

    const result = await getLeadList({ page: 1 }, "user-1", TODAY);
    expect(result.leads).toHaveLength(25);
    expect(result.leads.at(-1)?.id).toBe("lead-24");
    expect(result.hasNextPage).toBe(true);
  });

  it("maps rows, zero-fills the funnel and returns the owner options", async () => {
    useFakeDb({
      responses: [
        [
          listRow(1, [undefined, "Ana Pérez", undefined, "quoted", "other", "unknown", TRIP_ID, "Maratón de Santiago 2027", "Panamá", undefined, undefined, undefined, "2026-10-25", "Enviar la cotización."]),
          listRow(2, [undefined, undefined, undefined, undefined, undefined, "event", undefined, undefined, undefined, "user-9", "ex@example.com", false]),
          // Web form lead without owner: the LEFT JOIN returns NULL owner columns.
          listRow(3, [undefined, "Bea Web", undefined, undefined, "web_form", "web", undefined, undefined, "Panamá", null, null, false]),
        ],
        [
          ["quoted", 1],
          ["new", 4],
        ],
        [["user-1", "ana@example.com"]],
      ],
    });

    await expect(getLeadList({ page: 1 }, "user-1", TODAY)).resolves.toEqual({
      leads: [
        {
          id: "lead-1",
          fullName: "Ana Pérez",
          phone: "+51938127170",
          stage: "quoted",
          source: "other",
          channel: "unknown",
          trip: { id: TRIP_ID, title: "Maratón de Santiago 2027" },
          destinationText: "Panamá",
          owner: { userId: "user-1", email: "ana@example.com", active: true },
          nextActionDate: "2026-10-25",
          nextActionNote: "Enviar la cotización.",
        },
        {
          id: "lead-2",
          fullName: "Lead 2",
          phone: "+51938127170",
          stage: "new",
          source: "whatsapp",
          channel: "event",
          trip: null,
          destinationText: null,
          owner: { userId: "user-9", email: "ex@example.com", active: false },
          nextActionDate: null,
          nextActionNote: null,
        },
        {
          id: "lead-3",
          fullName: "Bea Web",
          phone: "+51938127170",
          stage: "new",
          source: "web_form",
          channel: "web",
          trip: null,
          destinationText: "Panamá",
          owner: null,
          nextActionDate: null,
          nextActionNote: null,
        },
      ],
      hasNextPage: false,
      stageCounts: { new: 4, contacted: 0, quoted: 1, reserved: 0, paid: 0, lost: 0 },
      ownerOptions: [{ userId: "user-1", email: "ana@example.com" }],
    });
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(getLeadList({ page: 1 }, "user-1", TODAY)).rejects.toBe(failure);
  });
});

describe("getLeadFormOptions", () => {
  it("reads active owners and non-archived trips in one batch", async () => {
    const fake = useFakeDb({
      responses: [
        [["user-1", "ana@example.com"]],
        [[TRIP_ID, "Maratón de Santiago 2027", "draft"]],
      ],
    });

    await expect(getLeadFormOptions()).resolves.toEqual({
      ownerOptions: [{ userId: "user-1", email: "ana@example.com" }],
      tripOptions: [{ id: TRIP_ID, title: "Maratón de Santiago 2027", status: "draft" }],
    });

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    const [owners, tripsQuery] = fake.queries;
    expect(normalize(owners.sql)).toContain(`where (${ACTIVE_OWNER_ROLES})`);
    expect(owners.params).toEqual(["commercial", "admin"]);
    expect(normalize(tripsQuery.sql)).toBe(
      'select "id", "title", "status" from "trips" where "trips"."status" <> $1 order by "trips"."race_date" asc, "trips"."title" asc',
    );
    expect(tripsQuery.params).toEqual(["archived"]);
  });
});

describe("createLead", () => {
  const input: CreateLeadInput = {
    fullName: "Ana Pérez",
    phone: "+51938127170",
    email: "ana@example.com",
    location: "Lima",
    tripId: TRIP_ID,
    destinationText: null,
    source: "whatsapp",
    ownerUserId: "user-2",
    note: "Quiere la 21K.",
    consent: "on",
    channel: "referral",
    originDetail: "Media Maratón de Lima 2026",
    referredBy: "Club Runners Lima",
    referralPermission: true,
    contactPreference: "call",
  };

  it("inserts the lead, its created activity and its lead.created event in a single statement", async () => {
    const fake = useFakeDb({ responses: [[{ id: "lead-1", owner_ok: true, trip_ok: true }]] });

    await expect(createLead(input, "user-1")).resolves.toEqual({ id: "lead-1" });

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement.match(/;/g)).toBeNull();
    expect(statement).toMatch(
      /^WITH checks AS \( SELECT exists \(select 1 from "staff_assignments" where \("staff_assignments"\."user_id" = \$1 and \("staff_assignments"\."revoked_at" is null and "staff_assignments"\."role" in \(\$2, \$3\)\)\)\) AS owner_ok, \(\$4::uuid IS NULL OR EXISTS \( SELECT 1 FROM trips WHERE trips\.id = \$5::uuid AND trips\.status <> 'archived' \)\) AS trip_ok \)/,
    );
    expect(statement).toContain(
      "INSERT INTO leads ( full_name, phone, email, location, trip_id, destination_text, source, owner_user_id, consent_version, created_by, channel, origin_detail, referred_by, referral_permission, contact_preference ) SELECT $6, $7, $8, $9, $10::uuid, $11, $12::lead_source, $13, $14, $15, $16::lead_channel, $17, $18, $19::boolean, $20::contact_preference FROM checks WHERE owner_ok AND trip_ok RETURNING id, source",
    );
    expect(statement).toContain(
      "INSERT INTO lead_activities (lead_id, type, body, actor_user_id) SELECT id, 'created', $21, $22 FROM inserted",
    );
    // status, attempts and available_at take their defaults (pending, 0, now()); payload { source }
    // is built from the inserted lead (no personal data).
    expect(statement).toContain(
      "event AS ( INSERT INTO outbox_events (type, lead_id, payload) SELECT 'lead.created', id, jsonb_build_object('source', source) FROM inserted )",
    );
    expect(statement).toMatch(/SELECT \(SELECT id FROM inserted\) AS id, owner_ok, trip_ok FROM checks$/);
    expect(fake.queries[0].params).toEqual([
      "user-2",
      "commercial",
      "admin",
      TRIP_ID,
      TRIP_ID,
      "Ana Pérez",
      "+51938127170",
      "ana@example.com",
      "Lima",
      TRIP_ID,
      null,
      "whatsapp",
      "user-2",
      "crm-manual-v1",
      "user-1",
      "referral",
      "Media Maratón de Lima 2026",
      "Club Runners Lima",
      true,
      "call",
      "Quiere la 21K.",
      "user-1",
    ]);
  });

  it("sends the unknown origin and the empty optional origin fields as given", async () => {
    const fake = useFakeDb({ responses: [[{ id: "lead-1", owner_ok: true, trip_ok: true }]] });
    await createLead(
      { ...input, channel: "unknown", originDetail: null, referredBy: null, referralPermission: false, contactPreference: null },
      "user-1",
    );

    expect(fake.queries[0].params.slice(15, 20)).toEqual(["unknown", null, null, false, null]);
  });

  it("never writes the UTM fields nor contact_opt_out_at, and the event payload stays { source }", async () => {
    const fake = useFakeDb({ responses: [[{ id: "lead-1", owner_ok: true, trip_ok: true }]] });
    const extra = { utmSource: "instagram", utmMedium: "social", utmCampaign: "santiago-2027", contactOptOutAt: new Date() };
    await createLead({ ...input, ...extra } as CreateLeadInput, "user-1");

    const statement = normalize(fake.queries[0].sql);
    expect(statement).not.toMatch(/utm_|opt_out/);
    expect(fake.queries[0].params).not.toContain("instagram");
    expect(fake.queries[0].params).not.toContain(extra.contactOptOutAt);
    expect(statement).toContain("jsonb_build_object('source', source) FROM inserted");
    expect(statement).not.toMatch(/jsonb_build_object\('source', source, /);
  });

  it("never sends the stage: the column default applies", async () => {
    const fake = useFakeDb({ responses: [[{ id: "lead-1", owner_ok: true, trip_ok: true }]] });
    await createLead({ ...input, stage: "paid" } as CreateLeadInput, "user-1");

    expect(normalize(fake.queries[0].sql)).not.toMatch(/stage/i);
    expect(fake.queries[0].params).not.toContain("paid");
  });

  it.each([
    [{ id: null, owner_ok: false, trip_ok: true }, "invalid_owner"],
    [{ id: null, owner_ok: false, trip_ok: false }, "invalid_owner"],
    [{ id: null, owner_ok: true, trip_ok: false }, "invalid_trip"],
  ])("maps %o to %s", async (row, expected) => {
    useFakeDb({ responses: [[row]] });
    await expect(createLead(input, "user-1")).resolves.toBe(expected);
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(createLead(input, "user-1")).rejects.toMatchObject({ cause: failure });
  });
});

// Detail row in select order (array mode): id, full_name, phone, email, location, stage,
// lost_reason, source, trip id/title/status, destination_text, owner user_id/email/active,
// consent_version, consented_at, creator email, created_at, next_action_date/note,
// archived_at, archiver email, channel, origin_detail, utm_source/medium/campaign, referred_by,
// referral_permission, contact_preference, contact_opt_out_at.
function detailRow(overrides: Record<number, unknown> = {}) {
  const row: unknown[] = [
    LEAD_ID,
    "Ana Pérez",
    "+51938127170",
    "ana@example.com",
    "Lima",
    "lost",
    "Eligió otra agencia",
    "whatsapp",
    TRIP_ID,
    "Maratón de Santiago 2027",
    "archived",
    "Panamá",
    "user-1",
    "agent@example.com",
    true,
    "crm-manual-v1",
    "2026-10-18 14:00:00+00",
    "agent@example.com",
    "2026-10-18 14:00:00+00",
    null,
    null,
    null,
    null,
    "unknown",
    null,
    null,
    null,
    null,
    null,
    false,
    null,
    null,
  ];
  for (const [position, value] of Object.entries(overrides)) row[Number(position)] = value;
  return row;
}

describe("getLeadById", () => {
  it("returns null without querying when the id is not a UUID", async () => {
    const fake = useFakeDb();
    await expect(getLeadById("abc")).resolves.toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("returns null when the lead does not exist", async () => {
    useFakeDb({ responses: [[]] });
    await expect(getLeadById(LEAD_ID)).resolves.toBeNull();
  });

  it("reads the lead with LEFT JOINs for the owner, the author, the archiver and the trip", async () => {
    const fake = useFakeDb({ responses: [[detailRow()]] });

    await expect(getLeadById(LEAD_ID)).resolves.toEqual({
      id: LEAD_ID,
      fullName: "Ana Pérez",
      phone: "+51938127170",
      email: "ana@example.com",
      location: "Lima",
      stage: "lost",
      lostReason: "Eligió otra agencia",
      source: "whatsapp",
      trip: { id: TRIP_ID, title: "Maratón de Santiago 2027", status: "archived" },
      destinationText: "Panamá",
      owner: { userId: "user-1", email: "agent@example.com", active: true },
      consentVersion: "crm-manual-v1",
      consentedAt: new Date("2026-10-18T14:00:00Z"),
      createdBy: { email: "agent@example.com" },
      createdAt: new Date("2026-10-18T14:00:00Z"),
      nextActionDate: null,
      nextActionNote: null,
      archivedAt: null,
      archivedBy: null,
      channel: "unknown",
      originDetail: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referredBy: null,
      referralPermission: false,
      contactPreference: null,
      contactOptOutAt: null,
    });

    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain(
      'from "leads" left join "profiles" "owner" on "owner"."user_id" = "leads"."owner_user_id" left join "profiles" "creator" on "creator"."user_id" = "leads"."created_by" left join "profiles" "archiver" on "archiver"."user_id" = "leads"."archived_by" left join "trips" on "trips"."id" = "leads"."trip_id"',
    );
    expect(statement).toContain(
      '"leads"."channel", "leads"."origin_detail", "leads"."utm_source", "leads"."utm_medium", "leads"."utm_campaign", "leads"."referred_by", "leads"."referral_permission", "leads"."contact_preference", "leads"."contact_opt_out_at" from "leads"',
    );
    expect(statement).toMatch(/where "leads"\."id" = \$\d+ limit \$\d+$/);
    // Archived leads are read too: the detail shows them read-only.
    expect(statement).not.toContain("archived_at\" is null");
    expect(fake.queries[0].params).toEqual(["commercial", "admin", LEAD_ID, 1]);
  });

  it("returns owner: null and createdBy: null for a web form lead", async () => {
    useFakeDb({
      responses: [
        [detailRow({ 5: "new", 6: null, 7: "web_form", 8: null, 9: null, 10: null, 12: null, 13: null, 14: false, 15: "web-form-v1", 17: null })],
      ],
    });

    await expect(getLeadById(LEAD_ID)).resolves.toMatchObject({
      source: "web_form",
      trip: null,
      owner: null,
      consentVersion: "web-form-v1",
      createdBy: null,
      archivedBy: null,
    });
  });

  it("returns the origin, the campaign, the referral, the preference and the opt-out date", async () => {
    useFakeDb({
      responses: [
        [
          detailRow({
            23: "event",
            24: "Media Maratón de Lima 2026",
            25: "instagram",
            26: "social",
            27: "santiago-2027",
            28: "Club Runners Lima",
            29: true,
            30: "call",
            31: "2026-10-20 15:30:00+00",
          }),
        ],
      ],
    });

    await expect(getLeadById(LEAD_ID)).resolves.toMatchObject({
      channel: "event",
      originDetail: "Media Maratón de Lima 2026",
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "santiago-2027",
      referredBy: "Club Runners Lima",
      referralPermission: true,
      contactPreference: "call",
      contactOptOutAt: new Date("2026-10-20T15:30:00Z"),
    });
  });
});

describe("updateLead", () => {
  const input: UpdateLeadInput = {
    leadId: LEAD_ID,
    fullName: "Ana Pérez",
    phone: "+51999888777",
    email: null,
    location: null,
    tripId: TRIP_ID,
    destinationText: null,
    channel: "instagram",
    originDetail: "Reel de la 42K",
    referredBy: "Club Runners Lima",
    referralPermission: true,
    contactPreference: "whatsapp",
  };

  const TARGET = "WITH target AS ( SELECT id, channel, trip_id FROM leads WHERE id = $1::uuid AND archived_at IS NULL FOR UPDATE )";
  const SET =
    "UPDATE leads SET full_name = $2, phone = $3, email = $4, location = $5, trip_id = $6::uuid, destination_text = $7, " +
    "channel = $8::lead_channel, origin_detail = $9, referred_by = $10, referral_permission = $11::boolean, " +
    "contact_preference = $12::contact_preference, updated_at = now() FROM target";

  it("updates contact and origin and logs channel_changed in a single statement; an archived trip is accepted if it does not change", async () => {
    const fake = useFakeDb({ responses: [[{ found: true, updated: true }]] });

    await expect(updateLead(input, "user-1")).resolves.toBe("updated");

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement.match(/;/g)).toBeNull();
    expect(statement).toBe(
      `${TARGET}, ` +
        `updated AS ( ${SET} WHERE leads.id = target.id AND (target.trip_id = $13::uuid OR EXISTS ( SELECT 1 FROM trips WHERE trips.id = $14::uuid AND trips.status <> 'archived' )) RETURNING leads.id, target.channel AS channel_from ), ` +
        "activity AS ( INSERT INTO lead_activities (lead_id, type, channel_from, channel_to, actor_user_id) SELECT id, 'channel_changed', channel_from, $15::lead_channel, $16 FROM updated WHERE channel_from <> $17::lead_channel ) " +
        "SELECT EXISTS (SELECT 1 FROM target) AS found, EXISTS (SELECT 1 FROM updated) AS updated",
    );
    expect(fake.queries[0].params).toEqual([
      LEAD_ID,
      "Ana Pérez", "+51999888777", null, null, TRIP_ID, null,
      "instagram", "Reel de la 42K", "Club Runners Lima", true, "whatsapp",
      TRIP_ID, TRIP_ID,
      "instagram", "user-1", "instagram",
    ]);
  });

  it("origin change: the activity records the locked previous origin, the new one and the session user", async () => {
    const fake = useFakeDb({ responses: [[{ found: true, updated: true }]] });
    await updateLead({ ...input, channel: "event" }, "session-user");

    const statement = normalize(fake.queries[0].sql);
    // channel_from is the value read under FOR UPDATE, before the UPDATE replaced it.
    expect(statement).toContain("RETURNING leads.id, target.channel AS channel_from");
    expect(statement).toContain(
      "SELECT id, 'channel_changed', channel_from, $15::lead_channel, $16 FROM updated WHERE channel_from <> $17::lead_channel",
    );
    expect(fake.queries[0].params.slice(14)).toEqual(["event", "session-user", "event"]);
  });

  it("same origin: the activity insert is filtered out, so editing only contact or detail logs nothing", async () => {
    const fake = useFakeDb({ responses: [[{ found: true, updated: true }]] });
    await expect(updateLead({ ...input, originDetail: "Otro reel" }, "user-1")).resolves.toBe("updated");

    const statement = normalize(fake.queries[0].sql);
    // channel_changed is the only activity this statement can insert, and only when the origin differs.
    expect(statement.match(/INSERT INTO lead_activities/g)).toHaveLength(1);
    expect(statement).toMatch(/FROM updated WHERE channel_from <> \$17::lead_channel \)/);
    expect(statement).not.toMatch(/body|stage|owner_from/);
    expect(fake.queries[0].params[16]).toBe("instagram");
  });

  it("does not check any trip when it is removed", async () => {
    const fake = useFakeDb({ responses: [[{ found: true, updated: true }]] });
    await updateLead({ ...input, tripId: null }, "user-1");

    const statement = normalize(fake.queries[0].sql);
    expect(statement).toContain("FROM target WHERE leads.id = target.id RETURNING leads.id");
    expect(statement).not.toContain("trips");
    expect(fake.queries[0].params.slice(12)).toEqual(["instagram", "user-1", "instagram"]);
  });

  it("never writes the UTM fields, contact_opt_out_at, source, stage or owner", async () => {
    const fake = useFakeDb({ responses: [[{ found: true, updated: true }]] });
    const extra = { utmSource: "instagram-ads", contactOptOutAt: new Date(), source: "web_form", stage: "paid", ownerUserId: "intruder" };
    await updateLead({ ...input, ...extra } as UpdateLeadInput, "user-1");

    expect(normalize(fake.queries[0].sql)).not.toMatch(/utm_|opt_out|source|stage|owner_user_id/);
    for (const value of Object.values(extra)) expect(fake.queries[0].params).not.toContain(value);
  });

  it.each<[unknown[], string]>([
    [[{ found: true, updated: true }], "updated"],
    [[{ found: true, updated: false }], "invalid_trip"],
    [[{ found: false, updated: false }], "not_found"],
    [[], "not_found"],
  ])("maps rows %j to %s", async (rows, expected) => {
    useFakeDb({ responses: [rows] });
    await expect(updateLead(input, "user-1")).resolves.toBe(expected);
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(updateLead(input, "user-1")).rejects.toMatchObject({ cause: failure });
  });
});

describe("changeLeadStage", () => {
  it("updates the stage and inserts the stage_changed activity and the lead.stage_changed event in a single statement", async () => {
    const fake = useFakeDb({ responses: [[{ found: true, changed: true }]] });

    await expect(
      changeLeadStage({ leadId: LEAD_ID, stage: "quoted", lostReason: null }, "user-1"),
    ).resolves.toBe("changed");

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toBe(
      "WITH target AS ( SELECT id, stage FROM leads WHERE id = $1::uuid AND archived_at IS NULL FOR UPDATE ), " +
        "updated AS ( UPDATE leads SET stage = $2::lead_stage, lost_reason = $3, updated_at = now() FROM target WHERE leads.id = target.id AND target.stage <> $4::lead_stage RETURNING leads.id, target.stage AS stage_from ), " +
        "activity AS ( INSERT INTO lead_activities (lead_id, type, body, stage_from, stage_to, actor_user_id) SELECT id, 'stage_changed', $5, stage_from, $6::lead_stage, $7 FROM updated ), " +
        "event AS ( INSERT INTO outbox_events (type, lead_id, payload) SELECT 'lead.stage_changed', id, jsonb_build_object('stageFrom', stage_from, 'stageTo', $8::lead_stage) FROM updated ) " +
        "SELECT EXISTS (SELECT 1 FROM target) AS found, EXISTS (SELECT 1 FROM updated) AS changed",
    );
    // An open stage keeps the next action.
    expect(statement).not.toContain("next_action");
    expect(fake.queries[0].params).toEqual([LEAD_ID, "quoted", null, "quoted", null, "quoted", "user-1", "quoted"]);
  });

  it("emits the event only from the updated row: no_change and not_found insert no event", async () => {
    const fake = useFakeDb({ responses: [[{ found: true, changed: false }]] });
    await expect(changeLeadStage({ leadId: LEAD_ID, stage: "new", lostReason: null }, "user-1")).resolves.toBe(
      "no_change",
    );

    const statement = normalize(fake.queries[0].sql);
    // Exactly one event, of type lead.stage_changed, read from the UPDATE's RETURNING (no rows when the
    // stage does not change or the lead is missing or archived); payload { stageFrom, stageTo }, no trigger.
    expect(statement.match(/INSERT INTO outbox_events/g)).toHaveLength(1);
    expect(statement).toMatch(
      /event AS \( INSERT INTO outbox_events \(type, lead_id, payload\) SELECT 'lead\.stage_changed', id, jsonb_build_object\('stageFrom', stage_from, 'stageTo', \$\d+::lead_stage\) FROM updated \)/,
    );
    expect(statement).not.toContain("trigger");
    expect(statement).not.toContain("lead.created");
  });

  it.each(["paid", "lost"] as const)("a closed stage (%s) clears the next action", async (stage) => {
    const fake = useFakeDb({ responses: [[{ found: true, changed: true }]] });
    const input =
      stage === "lost"
        ? { leadId: LEAD_ID, stage, lostReason: "Eligió otra agencia" }
        : { leadId: LEAD_ID, stage, lostReason: null };
    const lostReason = input.lostReason;
    await changeLeadStage(input, "user-1");

    expect(normalize(fake.queries[0].sql)).toContain(
      "updated_at = now(), next_action_date = NULL, next_action_note = NULL FROM target",
    );
    // lost_reason and the activity body carry the reason (null for paid); the event carries the new stage.
    expect(fake.queries[0].params).toEqual([LEAD_ID, stage, lostReason, stage, lostReason, stage, "user-1", stage]);
  });

  it.each([
    [{ found: true, changed: false }, "no_change"],
    [{ found: false, changed: false }, "not_found"],
  ])("maps %o to %s", async (row, expected) => {
    useFakeDb({ responses: [[row]] });
    await expect(changeLeadStage({ leadId: LEAD_ID, stage: "new", lostReason: null }, "user-1")).resolves.toBe(
      expected,
    );
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(
      changeLeadStage({ leadId: LEAD_ID, stage: "new", lostReason: null }, "user-1"),
    ).rejects.toMatchObject({ cause: failure });
  });
});

describe("changeLeadOwner", () => {
  const input = { leadId: LEAD_ID, ownerUserId: "user-2" };

  it("updates the owner (IS DISTINCT FROM) and inserts owner_changed in a single statement", async () => {
    const fake = useFakeDb({ responses: [[{ found: true, changed: true, owner_ok: true }]] });

    await expect(changeLeadOwner(input, "user-1")).resolves.toBe("changed");

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement).toMatch(
      /^WITH checks AS \( SELECT exists \(select 1 from "staff_assignments" where \("staff_assignments"\."user_id" = \$1 and \("staff_assignments"\."revoked_at" is null and "staff_assignments"\."role" in \(\$2, \$3\)\)\)\) AS owner_ok \)/,
    );
    expect(statement).toContain(
      "target AS ( SELECT id, owner_user_id FROM leads WHERE id = $4::uuid AND archived_at IS NULL FOR UPDATE )",
    );
    // A lead without owner (NULL) also gets the first one: IS DISTINCT FROM, never "<>".
    expect(statement).toContain(
      "updated AS ( UPDATE leads SET owner_user_id = $5, updated_at = now() FROM target, checks WHERE leads.id = target.id AND checks.owner_ok AND target.owner_user_id IS DISTINCT FROM $6 RETURNING leads.id, target.owner_user_id AS owner_from )",
    );
    // owner_from is the previous owner, NULL for an unassigned lead.
    expect(statement).toContain(
      "activity AS ( INSERT INTO lead_activities (lead_id, type, owner_from, owner_to, actor_user_id) SELECT id, 'owner_changed', owner_from, $7, $8 FROM updated )",
    );
    expect(statement).toMatch(
      /SELECT EXISTS \(SELECT 1 FROM target\) AS found, EXISTS \(SELECT 1 FROM updated\) AS changed, owner_ok FROM checks$/,
    );
    expect(fake.queries[0].params).toEqual([
      "user-2", "commercial", "admin", LEAD_ID, "user-2", "user-2", "user-2", "user-1",
    ]);
  });

  it.each([
    [{ found: true, changed: true, owner_ok: true }, "changed"],
    [{ found: true, changed: false, owner_ok: true }, "no_change"],
    [{ found: true, changed: false, owner_ok: false }, "invalid_owner"],
    [{ found: false, changed: false, owner_ok: true }, "not_found"],
    [{ found: false, changed: false, owner_ok: false }, "not_found"],
  ])("maps %o to %s", async (row, expected) => {
    useFakeDb({ responses: [[row]] });
    await expect(changeLeadOwner(input, "user-1")).resolves.toBe(expected);
  });
});

describe("setNextAction", () => {
  const input = { leadId: LEAD_ID, nextActionDate: "2026-10-25", nextActionNote: "Enviar la cotización." };

  it("saves the date and the note of an open, non-archived lead without opt-out in a single statement", async () => {
    const fake = useFakeDb({ responses: [[{ found: true, opted_out: false, saved: true }]] });

    await expect(setNextAction(input)).resolves.toBe("saved");

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      "WITH target AS ( SELECT id, stage, contact_opt_out_at FROM leads WHERE id = $1::uuid AND archived_at IS NULL FOR UPDATE ), " +
        "updated AS ( UPDATE leads SET next_action_date = $2::date, next_action_note = $3, updated_at = now() FROM target WHERE leads.id = target.id AND target.contact_opt_out_at IS NULL AND target.stage NOT IN ($4::lead_stage, $5::lead_stage) RETURNING leads.id ) " +
        "SELECT EXISTS (SELECT 1 FROM target) AS found, EXISTS (SELECT 1 FROM target WHERE contact_opt_out_at IS NOT NULL) AS opted_out, EXISTS (SELECT 1 FROM updated) AS saved",
    );
    expect(fake.queries[0].params).toEqual([LEAD_ID, "2026-10-25", "Enviar la cotización.", "paid", "lost"]);
  });

  it("clears the next action with null date and note", async () => {
    const fake = useFakeDb({ responses: [[{ found: true, opted_out: false, saved: true }]] });
    await expect(setNextAction({ leadId: LEAD_ID, nextActionDate: null, nextActionNote: null })).resolves.toBe("saved");
    expect(fake.queries[0].params).toEqual([LEAD_ID, null, null, "paid", "lost"]);
  });

  it("returns opted_out without writing for a lead whose contact opted out, even if it reopened", async () => {
    const fake = useFakeDb({ responses: [[{ found: true, opted_out: true, saved: false }]] });

    await expect(setNextAction(input)).resolves.toBe("opted_out");

    // The UPDATE itself excludes opted-out leads: nothing is written, not even under a race.
    expect(normalize(fake.queries[0].sql)).toContain("WHERE leads.id = target.id AND target.contact_opt_out_at IS NULL AND");
  });

  it.each([
    [{ found: true, opted_out: false, saved: false }, "closed"],
    // The opt-out is checked before the stage: an opted-out lost lead is opted_out, not closed.
    [{ found: true, opted_out: true, saved: false }, "opted_out"],
    [{ found: false, opted_out: false, saved: false }, "not_found"],
  ])("maps %o to %s", async (row, expected) => {
    useFakeDb({ responses: [[row]] });
    await expect(setNextAction(input)).resolves.toBe(expected);
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(setNextAction(input)).rejects.toMatchObject({ cause: failure });
  });
});

describe("optOutLead", () => {
  const STATEMENT =
    "WITH target AS ( SELECT id, stage, contact_opt_out_at FROM leads WHERE id = $1::uuid AND archived_at IS NULL FOR UPDATE ), " +
    "updated AS ( UPDATE leads SET contact_opt_out_at = now(), stage = 'lost', " +
    "lost_reason = CASE target.stage WHEN 'lost' THEN leads.lost_reason ELSE $2 END, " +
    "next_action_date = NULL, next_action_note = NULL, updated_at = now() " +
    "FROM target WHERE leads.id = target.id AND target.contact_opt_out_at IS NULL RETURNING leads.id, target.stage AS stage_from ), " +
    "stage_activity AS ( INSERT INTO lead_activities (lead_id, type, body, stage_from, stage_to, actor_user_id) " +
    "SELECT id, 'stage_changed', $3, stage_from, 'lost', $4 FROM updated WHERE stage_from <> 'lost' ), " +
    "opt_out_activity AS ( INSERT INTO lead_activities (lead_id, type, actor_user_id) SELECT id, 'opted_out', $5 FROM updated ), " +
    "event AS ( INSERT INTO outbox_events (type, lead_id, payload) SELECT 'lead.opted_out', id, jsonb_build_object('stageFrom', stage_from) FROM updated ) " +
    "SELECT EXISTS (SELECT 1 FROM target) AS found, EXISTS (SELECT 1 FROM updated) AS opted_out";

  it("records the opt-out, moves to lost, clears the next action, logs both activities and the event in a single statement", async () => {
    const fake = useFakeDb({ responses: [[{ found: true, opted_out: true }]] });

    await expect(optOutLead(LEAD_ID, "session-user")).resolves.toBe("opted_out");

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    const statement = normalize(fake.queries[0].sql);
    expect(statement.match(/;/g)).toBeNull();
    expect(statement).toBe(STATEMENT);
    // The fixed reason goes to lost_reason and to the stage_changed body; the session user is the
    // author of both activities.
    expect(fake.queries[0].params).toEqual([
      LEAD_ID,
      "Pidió no seguir en contacto.",
      "Pidió no seguir en contacto.",
      "session-user",
      "session-user",
    ]);
  });

  it("an already lost lead keeps its reason and only gets the opted_out activity", async () => {
    const fake = useFakeDb({ responses: [[{ found: true, opted_out: true }]] });
    await optOutLead(LEAD_ID, "user-1");

    const statement = normalize(fake.queries[0].sql);
    // lost_reason is kept when the locked stage was already lost (e.g. "Precio").
    expect(statement).toContain("lost_reason = CASE target.stage WHEN 'lost' THEN leads.lost_reason ELSE $2 END");
    // stage_changed is filtered out when the stage does not change; opted_out is not filtered.
    expect(statement).toContain("FROM updated WHERE stage_from <> 'lost' )");
    expect(statement).toContain("SELECT id, 'opted_out', $5 FROM updated )");
  });

  it("emits lead.opted_out with { stageFrom } and never lead.stage_changed", async () => {
    const fake = useFakeDb({ responses: [[{ found: true, opted_out: true }]] });
    await optOutLead(LEAD_ID, "user-1");

    const statement = normalize(fake.queries[0].sql);
    expect(statement.match(/INSERT INTO outbox_events/g)).toHaveLength(1);
    expect(statement).toContain("SELECT 'lead.opted_out', id, jsonb_build_object('stageFrom', stage_from) FROM updated");
    expect(statement).not.toContain("lead.stage_changed");
  });

  it.each<[unknown[], string]>([
    [[{ found: true, opted_out: true }], "opted_out"],
    [[{ found: true, opted_out: false }], "no_change"],
    [[{ found: false, opted_out: false }], "not_found"],
    [[], "not_found"],
  ])("maps rows %j to %s", async (rows, expected) => {
    useFakeDb({ responses: [rows] });
    await expect(optOutLead(LEAD_ID, "user-1")).resolves.toBe(expected);
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(optOutLead(LEAD_ID, "user-1")).rejects.toMatchObject({ cause: failure });
  });
});

describe("archiveLead", () => {
  it("archives the lead, clears the next action and inserts the archived activity in a single statement", async () => {
    const fake = useFakeDb({ responses: [[{ archived: true }]] });

    await expect(archiveLead(LEAD_ID, "user-1")).resolves.toBe("archived");

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      "WITH target AS ( SELECT id FROM leads WHERE id = $1::uuid AND archived_at IS NULL FOR UPDATE ), " +
        "updated AS ( UPDATE leads SET archived_at = now(), archived_by = $2, next_action_date = NULL, next_action_note = NULL, updated_at = now() FROM target WHERE leads.id = target.id RETURNING leads.id ), " +
        "activity AS ( INSERT INTO lead_activities (lead_id, type, actor_user_id) SELECT id, 'archived', $3 FROM updated ) " +
        "SELECT EXISTS (SELECT 1 FROM updated) AS archived",
    );
    // The session user is both archived_by and the author of the activity.
    expect(fake.queries[0].params).toEqual([LEAD_ID, "user-1", "user-1"]);
  });

  it.each([[[{ archived: false }]], [[]]])("returns not_found for a missing or already archived lead (rows %j)", async (rows) => {
    useFakeDb({ responses: [rows] });
    await expect(archiveLead(LEAD_ID, "user-1")).resolves.toBe("not_found");
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(archiveLead(LEAD_ID, "user-1")).rejects.toMatchObject({ cause: failure });
  });
});

describe("writes on an archived lead", () => {
  // The database answers as for an archived lead: the archived_at IS NULL condition matches no row.
  const edit: UpdateLeadInput = {
    leadId: LEAD_ID,
    fullName: "Ana Pérez",
    phone: "+51999888777",
    email: null,
    location: null,
    tripId: null,
    destinationText: null,
    channel: "unknown",
    originDetail: null,
    referredBy: null,
    referralPermission: false,
    contactPreference: null,
  };

  it.each([
    ["updateLead", () => updateLead(edit, "user-1"), [[{ found: false, updated: false }]]],
    ["changeLeadStage", () => changeLeadStage({ leadId: LEAD_ID, stage: "quoted", lostReason: null }, "user-1"), [[{ found: false, changed: false }]]],
    ["changeLeadOwner", () => changeLeadOwner({ leadId: LEAD_ID, ownerUserId: "user-2" }, "user-1"), [[{ found: false, changed: false, owner_ok: true }]]],
    ["setNextAction", () => setNextAction({ leadId: LEAD_ID, nextActionDate: "2026-10-25", nextActionNote: null }), [[{ found: false, opted_out: false, saved: false }]]],
    ["optOutLead", () => optOutLead(LEAD_ID, "user-1"), [[{ found: false, opted_out: false }]]],
    ["archiveLead", () => archiveLead(LEAD_ID, "user-1"), [[{ archived: false }]]],
  ] as const)("%s filters archived_at is null and returns not_found", async (_, write, responses) => {
    const fake = useFakeDb({ responses: responses as unknown as unknown[][] });

    await expect(write()).resolves.toBe("not_found");
    for (const query of fake.queries) expect(query.sql.toLowerCase()).toMatch(/"?archived_at"? is null/);
  });
});
