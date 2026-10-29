import { z } from "zod";
import { blankToNull, requiredText } from "@/lib/form-schema";

const SLUG_MESSAGE = "Usa minúsculas, números y guiones (p. ej. marca-deportiva).";
const HTTPS_URL_MESSAGE = "Indica una URL que empiece por https://.";
const DESCRIPTION_MESSAGE = "La descripción debe tener entre 10 y 500 caracteres.";

// Same format as the sponsors_slug_format_chk CHECK. The regex matches tripSlugSchema on purpose:
// different messages and their own CHECK, so it is not shared.
export const sponsorSlugSchema = z
  .string({ error: SLUG_MESSAGE })
  .trim()
  .toLowerCase()
  .min(3, SLUG_MESSAGE)
  .max(80, SLUG_MESSAGE)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, SLUG_MESSAGE);

// Optional external https:// URL (logoUrl, websiteUrl); "" → null.
const httpsUrl = () =>
  blankToNull(
    z
      .url({ protocol: /^https$/, error: HTTPS_URL_MESSAGE })
      .startsWith("https://", HTTPS_URL_MESSAGE)
      .max(2048, HTTPS_URL_MESSAGE),
  );

// Input: the strings of Object.fromEntries(formData). z.object drops unknown keys such as createdBy.
export const sponsorFormSchema = z.object({
  name: requiredText(2, 80, "El nombre debe tener entre 2 y 80 caracteres."),
  slug: sponsorSlugSchema,
  logoUrl: httpsUrl(),
  websiteUrl: httpsUrl(),
  description: blankToNull(z.string().min(10, DESCRIPTION_MESSAGE).max(500, DESCRIPTION_MESSAGE)),
});

// The slug is fixed at creation: the edit form never sends it to the service.
export const updateSponsorSchema = sponsorFormSchema.omit({ slug: true }).extend({
  id: z.uuid({ error: "El patrocinador no es válido." }),
});
