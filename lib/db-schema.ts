// Application schema (public only). Never model or manage the neon_auth schema here.
import { sql } from "drizzle-orm";
import {
  check,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const staffRoleEnum = pgEnum("staff_role", ["commercial", "admin"]);

// Staff accounts only. user_id is the stable Neon Auth id (no cross-schema FK).
// email is lowercase and display-only: never used for authorization.
export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id").primaryKey(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("profiles_email_lowercase_chk", sql`${table.email} = lower(${table.email})`),
  ],
);

// Active assignment = revoked_at IS NULL. granted_by NULL = bootstrap script.
export const staffAssignments = pgTable(
  "staff_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    role: staffRoleEnum("role").notNull(),
    reason: text("reason").notNull(),
    grantedBy: text("granted_by").references(() => profiles.userId, {
      onDelete: "restrict",
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by").references(() => profiles.userId, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    uniqueIndex("staff_assignments_active_uq")
      .on(table.userId, table.role)
      .where(sql`${table.revokedAt} IS NULL`),
  ],
);

// Pending invitation = accepted_at IS NULL AND revoked_at IS NULL (expiry checked at query time).
export const staffInvitations = pgTable(
  "staff_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    role: staffRoleEnum("role").notNull(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '7 days'`),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedUserId: text("accepted_user_id").references(() => profiles.userId, {
      onDelete: "restrict",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by").references(() => profiles.userId, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    check(
      "staff_invitations_email_lowercase_chk",
      sql`${table.email} = lower(${table.email})`,
    ),
    uniqueIndex("staff_invitations_pending_email_uq")
      .on(table.email)
      .where(sql`${table.acceptedAt} IS NULL AND ${table.revokedAt} IS NULL`),
  ],
);
