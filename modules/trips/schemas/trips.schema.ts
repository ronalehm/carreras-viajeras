import { z } from "zod";

// Same values as the trip_status enum in lib/db-schema.ts (kept in sync by trips.schema.test.ts).
export const tripStatusSchema = z.enum(["draft", "published", "archived"]);

const SLUG_MESSAGE = "Usa minúsculas, números y guiones (p. ej. maraton-santiago-2027).";
const PRICE_MESSAGE = "Indica un precio en dólares, sin decimales.";
const CAPACITY_MESSAGE = "Indica un número entero de cupos entre 1 y 10.000.";
const DATE_MESSAGE = "Indica una fecha válida.";

export const tripSlugSchema = z
  .string({ error: SLUG_MESSAGE })
  .trim()
  .toLowerCase()
  .min(3, SLUG_MESSAGE)
  .max(80, SLUG_MESSAGE)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, SLUG_MESSAGE);

const requiredText = (min: number, max: number, message: string) =>
  z.string({ error: message }).trim().min(min, message).max(max, message);

// Optional form inputs arrive as "" when left blank: they become null.
const blankToNull = <T extends z.ZodType<unknown, string>>(schema: T) =>
  z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .pipe(schema.nullable());

// Free-text list: split, trim and drop empty items before validating.
const textList = (separator: RegExp | string) =>
  z.string().transform((value) =>
    value
      .split(separator)
      .map((item) => item.trim())
      .filter((item) => item !== ""),
  );

const wholeNumber = (message: string) =>
  z.string().regex(/^\d+$/, message).transform(Number);

const TRAVEL_DATE_FIELDS: PropertyKey[] = ["raceDate", "startDate", "endDate"];

// Input: the strings of Object.fromEntries(formData). z.object drops unknown keys such as status.
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
    includes: textList(/\r?\n/).pipe(
      z
        .array(z.string().max(160, "Cada elemento puede tener hasta 160 caracteres."))
        .max(20, "Indica como máximo 20 elementos."),
    ),
    priceUsd: blankToNull(
      wholeNumber(PRICE_MESSAGE).pipe(
        z.number().int().max(1_000_000, "El precio no puede superar 1.000.000 USD."),
      ),
    ),
    capacity: blankToNull(
      wholeNumber(CAPACITY_MESSAGE).pipe(
        z.number().int().min(1, CAPACITY_MESSAGE).max(10_000, CAPACITY_MESSAGE),
      ),
    ),
    imageUrl: blankToNull(
      z
        .url({ protocol: /^https$/, error: "Indica una URL que empiece por https://." })
        .startsWith("https://", "Indica una URL que empiece por https://.")
        .max(2048, "La URL puede tener hasta 2048 caracteres."),
    ),
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
  id: z.uuid(),
});

export const tripStatusChangeSchema = z.object({
  id: z.uuid(),
  status: tripStatusSchema,
});
