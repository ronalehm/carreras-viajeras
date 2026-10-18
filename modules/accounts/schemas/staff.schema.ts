import { z } from "zod";

// Same values as the staff_role enum in lib/db-schema.ts (kept in sync by staff.schema.test.ts).
export const staffRoleSchema = z.enum(["commercial", "admin"]);

// z.object drops unknown keys, so form fields such as invitedBy or expiresAt never reach the service.
export const inviteStaffSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: staffRoleSchema,
});

export const invitationIdSchema = z.object({
  invitationId: z.uuid(),
});

export const staffRoleChangeSchema = z.object({
  userId: z.string().min(1).max(255),
  role: staffRoleSchema,
});
