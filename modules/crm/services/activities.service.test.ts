// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { addLeadActivity, listLeadActivities } from "./activities.service";

type Query = { sql: string; params: unknown[] };

// Fake Neon HTTP client (same pattern as leads.service.test.ts): records every statement and
// answers each one, in order, with the given rows.
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

const LEAD_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";

// Activity row in select order (array mode): id, type, body, stage_from, stage_to,
// previous owner email, new owner email, channel_from, channel_to, actor email, created_at.
function activityRow(values: Partial<Record<number, unknown>>) {
  const row: unknown[] = [
    "activity-1", "note", null, null, null, null, null, null, null, "agent@example.com", "2026-10-18 14:00:00+00",
  ];
  for (const [position, value] of Object.entries(values)) row[Number(position)] = value;
  return row;
}

beforeEach(() => vi.mocked(getDb).mockReset());

describe("listLeadActivities", () => {
  it("returns an empty history without querying when the id is not a UUID", async () => {
    const fake = useFakeDb();
    await expect(listLeadActivities("abc")).resolves.toEqual([]);
    expect(fake.queries).toHaveLength(0);
  });

  it("reads the history newest first, with LEFT JOINs for the author and both owners", async () => {
    const fake = useFakeDb({ responses: [[]] });
    await listLeadActivities(LEAD_ID);

    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      'select "lead_activities"."id", "lead_activities"."type", "lead_activities"."body", "lead_activities"."stage_from", "lead_activities"."stage_to", "previous_owner"."email", "new_owner"."email", "lead_activities"."channel_from", "lead_activities"."channel_to", "actor"."email", "lead_activities"."created_at" ' +
        'from "lead_activities" ' +
        'left join "profiles" "actor" on "actor"."user_id" = "lead_activities"."actor_user_id" ' +
        'left join "profiles" "previous_owner" on "previous_owner"."user_id" = "lead_activities"."owner_from" ' +
        'left join "profiles" "new_owner" on "new_owner"."user_id" = "lead_activities"."owner_to" ' +
        'where "lead_activities"."lead_id" = $1 ' +
        'order by "lead_activities"."created_at" desc, "lead_activities"."id" desc',
    );
    expect(fake.queries[0].params).toEqual([LEAD_ID]);
  });

  it("maps manual, stage and owner activities with their author", async () => {
    useFakeDb({
      responses: [
        [
          activityRow({ 0: "a3", 1: "call", 2: "Llamó por la 21K." }),
          activityRow({ 0: "a2", 1: "stage_changed", 2: "Eligió otra agencia", 3: "quoted", 4: "lost" }),
          activityRow({ 0: "a1", 1: "owner_changed", 5: "agent@example.com", 6: "other@example.com" }),
        ],
      ],
    });

    await expect(listLeadActivities(LEAD_ID)).resolves.toEqual([
      {
        id: "a3",
        type: "call",
        body: "Llamó por la 21K.",
        stageFrom: null,
        stageTo: null,
        ownerFrom: null,
        ownerTo: null,
        channelFrom: null,
        channelTo: null,
        actor: { email: "agent@example.com" },
        createdAt: new Date("2026-10-18T14:00:00Z"),
      },
      {
        id: "a2",
        type: "stage_changed",
        body: "Eligió otra agencia",
        stageFrom: "quoted",
        stageTo: "lost",
        ownerFrom: null,
        ownerTo: null,
        channelFrom: null,
        channelTo: null,
        actor: { email: "agent@example.com" },
        createdAt: new Date("2026-10-18T14:00:00Z"),
      },
      {
        id: "a1",
        type: "owner_changed",
        body: null,
        stageFrom: null,
        stageTo: null,
        ownerFrom: { email: "agent@example.com" },
        ownerTo: { email: "other@example.com" },
        channelFrom: null,
        channelTo: null,
        actor: { email: "agent@example.com" },
        createdAt: new Date("2026-10-18T14:00:00Z"),
      },
    ]);
  });

  it("returns actor: null for the web form creation and for n8n automations, and ownerFrom: null for the first owner", async () => {
    useFakeDb({
      responses: [
        [
          activityRow({ 0: "a3", 1: "automation", 2: "Borrador para la etapa Cotizado enviado por correo al usuario.", 9: null }),
          activityRow({ 0: "a2", 1: "owner_changed", 6: "agent@example.com" }),
          activityRow({ 0: "a1", 1: "created", 9: null }),
        ],
      ],
    });

    const [automation, firstOwner, created] = await listLeadActivities(LEAD_ID);
    expect(automation).toMatchObject({ type: "automation", actor: null });
    expect(firstOwner).toMatchObject({
      type: "owner_changed",
      ownerFrom: null,
      ownerTo: { email: "agent@example.com" },
      actor: { email: "agent@example.com" },
    });
    expect(created).toMatchObject({ type: "created", body: null, actor: null });
  });

  it("maps the origin change (channel_from → channel_to) and the opt-out with their author", async () => {
    useFakeDb({
      responses: [
        [
          activityRow({ 0: "a2", 1: "opted_out" }),
          activityRow({ 0: "a1", 1: "channel_changed", 7: "unknown", 8: "instagram" }),
        ],
      ],
    });

    await expect(listLeadActivities(LEAD_ID)).resolves.toEqual([
      {
        id: "a2",
        type: "opted_out",
        body: null,
        stageFrom: null,
        stageTo: null,
        ownerFrom: null,
        ownerTo: null,
        channelFrom: null,
        channelTo: null,
        actor: { email: "agent@example.com" },
        createdAt: new Date("2026-10-18T14:00:00Z"),
      },
      {
        id: "a1",
        type: "channel_changed",
        body: null,
        stageFrom: null,
        stageTo: null,
        ownerFrom: null,
        ownerTo: null,
        channelFrom: "unknown",
        channelTo: "instagram",
        actor: { email: "agent@example.com" },
        createdAt: new Date("2026-10-18T14:00:00Z"),
      },
    ]);
  });
});

describe("addLeadActivity", () => {
  const input = { leadId: LEAD_ID, type: "call" as const, body: "Llamó por la 21K." };

  it("inserts the activity with the session user as author only if the lead exists and is not archived", async () => {
    const fake = useFakeDb({ responses: [[{ id: "activity-1" }]] });

    await expect(addLeadActivity(input, "user-1")).resolves.toBe("added");

    expect(fake.transaction).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
    expect(normalize(fake.queries[0].sql)).toBe(
      "INSERT INTO lead_activities (lead_id, type, body, actor_user_id) SELECT id, $1::lead_activity_type, $2, $3 FROM leads WHERE id = $4::uuid AND archived_at IS NULL FOR SHARE RETURNING id",
    );
    expect(fake.queries[0].params).toEqual(["call", "Llamó por la 21K.", "user-1", LEAD_ID]);
  });

  it("returns not_found when no row is inserted (missing or archived lead)", async () => {
    useFakeDb({ responses: [[]] });
    await expect(addLeadActivity(input, "user-1")).resolves.toBe("not_found");
  });

  it("propagates database rejections", async () => {
    const failure = new Error("connection refused");
    useFakeDb({ failWith: failure });
    await expect(addLeadActivity(input, "user-1")).rejects.toMatchObject({ cause: failure });
  });
});
