import { z } from "zod";
import type { UserListFilter } from "../types/userDirectory.types";

// Active roles of the staff_role enum plus "runner", which is derived and grants nothing.
export const userRoleFilterSchema = z.enum(["commercial", "admin", "sponsor", "runner"]);

// URL filters (?q=, ?rol=). Each key is dropped on any invalid value, including a repeated
// parameter (an array), so parsing never throws. Unknown keys are discarded.
export const userListFilterSchema: z.ZodType<UserListFilter, { q?: unknown; rol?: unknown }> = z
  .object({
    q: z.string().trim().min(1).max(100).optional().catch(undefined),
    rol: userRoleFilterSchema.optional().catch(undefined),
  })
  .transform(({ q, rol }) => ({ q, role: rol }));
