import { z } from "zod";

// Shared zod helpers for form inputs (the strings of Object.fromEntries(formData)).
// Error messages are fixed texts: they never include the submitted value.

// Required free text: trimmed, then between min and max characters.
export const requiredText = (min: number, max: number, message: string) =>
  z.string({ error: message }).trim().min(min, message).max(max, message);

// Optional input helper; lives in its own module so it has a single definition.
export { blankToNull } from "./blankToNull";

// E.164: drop spaces, parentheses, dashes and dots, then "+" and 8 to 15 digits.
export const e164PhoneSchema = (message: string) =>
  z
    .string({ error: message })
    .transform((value) => value.replace(/[\s().-]/g, ""))
    .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, message));
