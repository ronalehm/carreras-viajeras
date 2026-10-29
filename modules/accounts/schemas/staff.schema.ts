import { z } from "zod";
import { emailSchema } from "./auth.schema";

// All database assignment roles, including system-managed and sponsor assignments.
// Kept in sync with lib/db-schema.ts by staff.schema.test.ts.
export const assignmentRoleSchema = z.enum(["commercial", "admin", "super_admin", "organizer", "sponsor"]);

// Team forms exclude super_admin and sponsor; each action also checks canManageRole().
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
