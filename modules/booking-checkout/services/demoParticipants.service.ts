import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { checkoutDemoParticipants, profiles } from "@/lib/db-schema";
import { getStripeCheckoutConfig } from "@/lib/env";

// Demo participants are managed from /crm/contratos (bookings-stripe-checkout-demo.md, B). The
// person is found by the verified primary email stored in profiles, so they must have signed in
// once; only their Clerk userId is kept. The actor always comes from the session.
export const grantDemoParticipantSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Escribe un correo válido.").max(254, "Escribe un correo válido.")),
  note: z.string().trim().max(200, "La nota admite hasta 200 caracteres.").transform(value => value || null),
});
export const revokeDemoParticipantSchema = z.object({ userId: z.string().trim().min(1).max(255) });
export type GrantDemoParticipantInput = z.infer<typeof grantDemoParticipantSchema>;
export type RevokeDemoParticipantInput = z.infer<typeof revokeDemoParticipantSchema>;

export type DemoParticipant = {
  userId: string;
  email: string;
  note: string | null;
  grantedByEmail: string;
  grantedAt: Date;
  revokedAt: Date | null;
};
export type GrantDemoParticipantResult = "granted" | "restored" | "already_active" | "account_not_found" | "ambiguous_account";
export type RevokeDemoParticipantResult = "revoked" | "not_active";
// What the CRM shows about Checkout: the mode only, never secrets or the reason it is off.
export type CheckoutStatus = "off" | "test" | "demo" | "live";

export function getCheckoutStatus(): CheckoutStatus {
  const config = getStripeCheckoutConfig();
  return config.enabled && config.mode ? config.mode : "off";
}

const grantedBy = alias(profiles, "granted_by_profile");

// Active participants first, then the most recent grants.
export async function listDemoParticipants(): Promise<DemoParticipant[]> {
  return getDb().select({
    userId: checkoutDemoParticipants.userId,
    email: profiles.email,
    note: checkoutDemoParticipants.note,
    grantedByEmail: grantedBy.email,
    grantedAt: checkoutDemoParticipants.grantedAt,
    revokedAt: checkoutDemoParticipants.revokedAt,
  }).from(checkoutDemoParticipants)
    .innerJoin(profiles, eq(profiles.userId, checkoutDemoParticipants.userId))
    .innerJoin(grantedBy, eq(grantedBy.userId, checkoutDemoParticipants.grantedBy))
    .orderBy(sql`${checkoutDemoParticipants.revokedAt} IS NOT NULL`, desc(checkoutDemoParticipants.grantedAt))
    .limit(200);
}

type GrantRow = { matches: number; changed: number; inserted: boolean };

// One statement: find the single enabled account with that email, then insert it or reactivate a
// revoked row (revoked_at = NULL, new granted_by, granted_at and note). An active row is left as is,
// so its audit fields keep the original grant. More than one account with the email grants nothing.
export async function grantDemoParticipant(input: GrantDemoParticipantInput, actorId: string): Promise<GrantDemoParticipantResult> {
  const parsed = grantDemoParticipantSchema.parse(input);
  const result = await getDb().execute<GrantRow>(sql`
    WITH candidates AS (
      SELECT ${profiles.userId} AS user_id FROM ${profiles}
      WHERE ${profiles.email} = ${parsed.email} AND ${profiles.disabledAt} IS NULL AND ${profiles.deletedAt} IS NULL
      LIMIT 2
    ), granted AS (
      INSERT INTO ${checkoutDemoParticipants} (${sql.raw('"user_id", "note", "granted_by"')})
      SELECT user_id, ${parsed.note}, ${actorId} FROM candidates
      WHERE (SELECT count(*) FROM candidates) = 1
      ON CONFLICT (${sql.raw('"user_id"')}) DO UPDATE
        SET ${sql.raw('"note" = excluded."note", "granted_by" = excluded."granted_by", "granted_at" = now(), "revoked_at" = NULL')}
        WHERE ${checkoutDemoParticipants.revokedAt} IS NOT NULL
      RETURNING (xmax = 0) AS inserted
    )
    SELECT (SELECT count(*) FROM candidates)::int AS matches,
      (SELECT count(*) FROM granted)::int AS changed,
      coalesce((SELECT bool_and(inserted) FROM granted), false) AS inserted
  `);
  const row = result.rows[0];
  const matches = Number(row?.matches ?? 0);
  if (matches === 0) return "account_not_found";
  if (matches > 1) return "ambiguous_account";
  if (Number(row?.changed ?? 0) === 0) return "already_active";
  return row?.inserted ? "granted" : "restored";
}

export async function revokeDemoParticipant(input: RevokeDemoParticipantInput): Promise<RevokeDemoParticipantResult> {
  const parsed = revokeDemoParticipantSchema.parse(input);
  const rows = await getDb().update(checkoutDemoParticipants).set({ revokedAt: sql`now()` })
    .where(and(eq(checkoutDemoParticipants.userId, parsed.userId), isNull(checkoutDemoParticipants.revokedAt)))
    .returning({ userId: checkoutDemoParticipants.userId });
  return rows.length ? "revoked" : "not_active";
}
