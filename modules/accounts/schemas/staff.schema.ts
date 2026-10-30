import { z } from "zod";
import { emailSchema } from "./auth.schema";

// All database assignment roles, including system-managed and sponsor assignments.
// Kept in sync with lib/db-schema.ts by staff.schema.test.ts.
export const assignmentRoleSchema = z.enum(["commercial", "admin", "super_admin", "organizer", "sponsor"]);

// Invitations and team roles exclude super_admin and sponsor (inviting a sponsor needs a brand:
// accounts-user-management F2). Each action also checks canManageRole().
export const staffRoleSchema = z.enum(["commercial", "organizer", "admin"]);

// z.object drops unknown keys, so form fields such as invitedBy or expiresAt never reach the service.
export const inviteStaffSchema = z.object({
  email: emailSchema,
  role: staffRoleSchema,
});

export const invitationIdSchema = z.object({
  invitationId: z.uuid(),
});

const userIdSchema = z.string().min(1).max(255);

// Roles granted or revoked from a user's page: the team roles plus sponsor (accounts-role-requests R20).
export const assignableRoleSchema = z.enum([...staffRoleSchema.options, "sponsor"]);

// Revoking needs only the account and the role, also for sponsor.
export const staffRoleRevokeSchema = z.object({
  userId: userIdSchema,
  role: assignableRoleSchema,
});

// Granting sponsor also needs its brand. The first step reports userId and role errors together;
// the second requires sponsorId only for sponsor and drops unknown keys (such as grantedBy).
export const staffRoleChangeSchema = staffRoleRevokeSchema.loose().pipe(
  z.discriminatedUnion("role", [
    z.object({ userId: userIdSchema, role: staffRoleSchema }),
    z.object({ userId: userIdSchema, role: z.literal("sponsor"), sponsorId: z.uuid() }),
  ]),
);
