import { z } from "zod";

// Optional form inputs arrive as "" when left blank: they become null. A missing key (an action
// called without that field) counts as blank, so it never yields zod's English type error.
export const blankToNull = <T extends z.ZodType<unknown, string>>(schema: T) =>
  z
    .string()
    .optional()
    .transform((value = "") => value.trim() || null)
    .pipe(schema.nullable());
