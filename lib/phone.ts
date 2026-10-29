import { z } from "zod";

const PHONE_MESSAGE = "Escribe el número con código de país, p. ej. +51 938 127 170.";

// E.164: drop spaces, parentheses, dashes and dots, then "+" and 8 to 15 digits.
// Shared by the CRM forms (manual and web) and the n8n integration API.
export const phoneSchema = z
  .string({ error: PHONE_MESSAGE })
  .transform((value) => value.replace(/[\s().-]/g, ""))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, PHONE_MESSAGE));
