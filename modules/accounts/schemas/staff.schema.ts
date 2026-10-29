import { z } from "zod";
import { emailSchema } from "./auth.schema";

// staff_role enum values minus super_admin, which is never managed from the CRM
// (kept in sync with lib/db-schema.ts by staff.schema.test.ts).
export const staffRoleSchema = z.enum(["commercial", "organizer", "admin"]);

// z.object drops unknown keys, so form fields such as invitedBy or expiresAt never reach the service.
export const inviteStaffSchema = z.object({
  email: emailSchema,
  role: staffRoleSchema,
});

export const invitationIdSchema = z.object({
  invitationId: z.uuid(),
});

export const staffRoleChangeSchema = z.object({
  userId: z.string().min(1).max(255),
  role: staffRoleSchema,
});
