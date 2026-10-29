import { z } from "zod";
import { blankToNull } from "@/lib/blankToNull";

// Same values as the trip_status enum in lib/db-schema.ts (kept in sync by trips.schema.test.ts).
export const tripStatusSchema = z.enum(["draft", "published", "archived"], {
  error: "El estado no es válido.",
});

const SLUG_MESSAGE = "Usa minúsculas, números y guiones (p. ej. maraton-santiago-2027).";
const HTTPS_URL_MESSAGE = "Indica una URL que empiece por https://.";
const CAPACITY_MESSAGE = "Indica un número entero de cupos entre 1 y 10,000.";
const DATE_MESSAGE = "Indica una fecha válida.";
const TRIP_ID_MESSAGE = "El viaje no es válido.";

export const tripSlugSchema = z
  .string({ error: SLUG_MESSAGE })
  .trim()
  .toLowerCase()
  .min(3, SLUG_MESSAGE)
  .max(80, SLUG_MESSAGE)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, SLUG_MESSAGE);

export const requiredText = (min: number, max: number, message: string) =>
  z.string({ error: message }).trim().min(min, message).max(max, message);

// Free-text list: split, trim and drop empty items before validating. A missing key is an empty list.
export const textList = (separator: RegExp | string) =>
  z
    .string()
    .optional()
    .transform((value = "") =>
      value
        .split(separator)
        .map((item) => item.trim())
        .filter((item) => item !== ""),
    );

export const wholeNumber = (message: string) =>
  z.string().regex(/^\d+$/, message).transform(Number);

// Optional external https:// URL (imageUrl, officialUrl).
const httpsUrl = (message: string) =>
  blankToNull(
    z
      .url({ protocol: /^https$/, error: message })
      .startsWith("https://", message)
      .max(2048, "La URL puede tener hasta 2048 caracteres."),
  );

// One item per line (includes, excludes).
const lineList = () =>
  textList(/\r?\n/).pipe(
    z
      .array(z.string().max(160, "Cada elemento puede tener hasta 160 caracteres."))
      .max(20, "Indica como máximo 20 elementos."),
  );

const longText = () => blankToNull(z.string().max(1000, "Puede tener hasta 1000 caracteres."));

const TRAVEL_DATE_FIELDS: PropertyKey[] = ["raceDate", "startDate", "endDate"];

// Input: the strings of Object.fromEntries(formData). z.object drops unknown keys such as status and
// the old price fields (priceUsd, depositUsd…): prices live in the trip offers, never in trips.
export const tripFormSchema = z
  .object({
    title: requiredText(3, 120, "El título debe tener entre 3 y 120 caracteres."),
    slug: tripSlugSchema,
    city: requiredText(2, 80, "La ciudad debe tener entre 2 y 80 caracteres."),
    country: requiredText(2, 80, "El país debe tener entre 2 y 80 caracteres."),
    raceDate: z.iso.date({ error: "Indica la fecha de la carrera." }),
    startDate: blankToNull(z.iso.date({ error: DATE_MESSAGE })),
    endDate: blankToNull(z.iso.date({ error: DATE_MESSAGE })),
    distances: textList(",").pipe(
      z
        .array(z.string().max(20, "Cada distancia puede tener hasta 20 caracteres."))
        .min(1, "Indica al menos una distancia.")
        .max(10, "Indica como máximo 10 distancias."),
    ),
    summary: requiredText(10, 300, "El resumen debe tener entre 10 y 300 caracteres."),
    includes: lineList(),
    excludes: lineList(),
    notes: longText(),
    capacity: blankToNull(
      wholeNumber(CAPACITY_MESSAGE).pipe(
        z.number().int().min(1, CAPACITY_MESSAGE).max(10_000, CAPACITY_MESSAGE),
      ),
    ),
    imageUrl: httpsUrl(HTTPS_URL_MESSAGE),
    officialUrl: httpsUrl(HTTPS_URL_MESSAGE),
  })
  .superRefine((trip, ctx) => {
    // Zod still runs this refinement when a field failed: compare dates only if all of them are valid.
    if (ctx.issues.some((issue) => TRAVEL_DATE_FIELDS.includes(issue.path?.[0] ?? ""))) return;

    const { raceDate, startDate, endDate } = trip;
    if (startDate === null && endDate === null) return;
    if (startDate === null) {
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Indica también la fecha de inicio del viaje.",
      });
      return;
    }
    if (endDate === null) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Indica también la fecha de fin del viaje.",
      });
      return;
    }
    // ISO dates (YYYY-MM-DD) compare correctly as strings.
    if (endDate < startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "La fecha de fin no puede ser anterior a la de inicio.",
      });
      return;
    }
    if (raceDate < startDate || raceDate > endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["raceDate"],
        message: "La carrera debe estar dentro de las fechas del viaje.",
      });
    }
  });

// safeExtend keeps the travel-date refinement of tripFormSchema.
export const updateTripSchema = tripFormSchema.safeExtend({
  id: z.uuid({ error: TRIP_ID_MESSAGE }),
});

export const tripStatusChangeSchema = z.object({
  id: z.uuid({ error: TRIP_ID_MESSAGE }),
  status: tripStatusSchema,
});
