import { z } from "zod";

// Shared zod helpers for form inputs (the strings of Object.fromEntries(formData)).
// Error messages are fixed texts: they never include the submitted value.

// Required free text: trimmed, then between min and max characters.
export const requiredText = (min: number, max: number, message: string) =>
  z.string({ error: message }).trim().min(min, message).max(max, message);

// Optional form inputs arrive as "" when left blank: they become null. A missing key (an action
// called without that field) counts as blank, so it never yields zod's English type error.
// Otherwise the value is trimmed and validated with `schema`.
export const blankToNull = <T extends z.ZodType<unknown, string>>(schema: T) =>
  z
    .string()
    .optional()
    .transform((value = "") => value.trim() || null)
    .pipe(schema.nullable());

// E.164: drop spaces, parentheses, dashes and dots, then "+" and 8 to 15 digits.
export const e164PhoneSchema = (message: string) =>
  z
    .string({ error: message })
    .transform((value) => value.replace(/[\s().-]/g, ""))
    .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, message));
