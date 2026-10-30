import { z } from "zod";

// Same bound as the userId of staffRoleChangeSchema. z.object drops every other field (actor,
// status, dates…): the actor always comes from the session.
export const accountTargetSchema = z.object({
  userId: z.string().min(1).max(255),
});

// The typed email is only compared with profiles.email inside the deletion statement, so it is
// normalized like the stored one (trimmed, lowercase) and never needs to be a well-formed address.
export const deleteAccountSchema = accountTargetSchema.extend({
  confirmEmail: z.string().trim().toLowerCase().min(1).max(320),
});
