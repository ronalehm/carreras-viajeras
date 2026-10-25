import { z } from "zod";

// Same values as the database enums in lib/db-schema.ts (kept in sync by bookings.schema.test.ts).
export const bookingStatusSchema = z.enum(["pending", "confirmed", "cancelled"], {
  error: "El estado no es válido.",
});
export const itineraryKindSchema = z.enum(
  ["document", "registration", "flight", "transfer", "hotel", "activity", "race", "return"],
  { error: "El tipo no es válido." },
);
export const itineraryStatusSchema = z.enum(
  ["pending", "provisional", "confirmed", "completed", "cancelled"],
  { error: "El estado no es válido." },
);

const EMAIL_MESSAGE = "Introduce un correo válido.";
const DATE_MESSAGE = "Indica una fecha válida.";
const BOOKING_ID_MESSAGE = "La reserva no es válida.";

const requiredText = (min: number, max: number, message: string) =>
  z.string({ error: message }).trim().min(min, message).max(max, message);

// Optional form inputs arrive as "" when left blank: they become null. A missing key counts as
// blank. Same pattern as trips.schema.ts (moved to lib/ on its third real use).
const blankToNull = <T extends z.ZodType<unknown, string>>(schema: T) =>
  z
    .string()
    .optional()
    .transform((value = "") => value.trim() || null)
    .pipe(schema.nullable());

// Whole USD (Decision 10): digits only, so decimals ("1499.50"), signs, blanks and letters fail.
const usdIntegerSchema = (min: number, message: string) =>
  z
    .string({ error: message })
    .trim()
    .regex(/^\d+$/, message)
    .transform(Number)
    .pipe(z.number().int().min(min, message).max(1_000_000, message));

const bookingFields = {
  participantName: requiredText(2, 120, "El nombre debe tener entre 2 y 120 caracteres."),
  participantEmail: z
    .string({ error: EMAIL_MESSAGE })
    .trim()
    .toLowerCase()
    .pipe(z.email(EMAIL_MESSAGE).max(254, EMAIL_MESSAGE)),
  packageLabel: requiredText(1, 80, "El paquete debe tener entre 1 y 80 caracteres."),
  distance: blankToNull(z.string().max(20, "La distancia puede tener hasta 20 caracteres.")),
  totalUsd: usdIntegerSchema(0, "Indica el total en dólares, sin decimales."),
  balanceDueOn: blankToNull(z.iso.date({ error: DATE_MESSAGE })),
  internalNote: blankToNull(z.string().max(2000, "La nota puede tener hasta 2000 caracteres.")),
};

// Input: the strings of Object.fromEntries(formData). z.object drops unknown keys such as
// runnerUserId, status or createdBy: they never come from the form.
export const bookingFormSchema = z.object({
  tripId: z.uuid({ error: "Elige un viaje." }),
  ...bookingFields,
});

// The trip cannot change after creation.
export const updateBookingSchema = z.object({
  bookingId: z.uuid({ error: BOOKING_ID_MESSAGE }),
  ...bookingFields,
});

export const bookingStatusChangeSchema = z.object({
  bookingId: z.uuid({ error: BOOKING_ID_MESSAGE }),
  status: z.enum(["confirmed", "cancelled"], { error: "El estado no es válido." }),
});

export const paymentFormSchema = z.object({
  bookingId: z.uuid({ error: BOOKING_ID_MESSAGE }),
  amountUsd: usdIntegerSchema(1, "Indica el importe en dólares, sin decimales."),
  paidOn: z.iso.date({ error: DATE_MESSAGE }),
  concept: requiredText(1, 80, "El concepto debe tener entre 1 y 80 caracteres."),
});

export const paymentVoidSchema = z.object({
  paymentId: z.uuid({ error: "El pago no es válido." }),
});

const ITEM_DATE_MESSAGE = "Indica la fecha.";
const TIME_ZONE_MESSAGE = "Indica la zona horaria.";
const INVALID_TIME_ZONE_MESSAGE = "Indica una zona horaria válida, como America/Lima.";

// The zone's canonical IANA name ("US/Eastern" → "America/New_York", "AMERICA/LIMA" → "America/Lima"),
// or null when Intl (and so Workers) does not know it or the name fails the database CHECK.
export function canonicalTimeZone(timeZone: string): string | null {
  let canonical: string;
  try {
    canonical = new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
  return /^[A-Za-z]+(\/[A-Za-z0-9_+-]+)+$/.test(canonical) && canonical.length <= 64 ? canonical : null;
}

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Indica una hora válida.");
const timeZoneSchema = z.string().transform((timeZone, ctx) => {
  const canonical = canonicalTimeZone(timeZone);
  if (!canonical) ctx.addIssue({ code: "custom", message: INVALID_TIME_ZONE_MESSAGE });
  return canonical ?? z.NEVER;
});

const itineraryItemFields = {
  kind: itineraryKindSchema,
  status: itineraryStatusSchema,
  title: requiredText(1, 120, "El título debe tener entre 1 y 120 caracteres."),
  details: blankToNull(z.string().max(1000, "Los detalles pueden tener hasta 1000 caracteres.")),
  location: blankToNull(z.string().max(160, "La ubicación puede tener hasta 160 caracteres.")),
  startDate: blankToNull(z.iso.date({ error: DATE_MESSAGE })),
  startTime: blankToNull(timeSchema),
  startTimeZone: blankToNull(timeZoneSchema),
  endDate: blankToNull(z.iso.date({ error: DATE_MESSAGE })),
  endTime: blankToNull(timeSchema),
  endTimeZone: blankToNull(timeZoneSchema),
  // A native checkbox sends "on" when checked and nothing when not.
  runnerVisible: z.string().optional().transform((value) => value === "on"),
};

type ItinerarySchedule = {
  startDate: string | null; startTime: string | null; startTimeZone: string | null;
  endDate: string | null; endTime: string | null; endTimeZone: string | null;
};

// Each error lands on the field to fix. Dates are YYYY-MM-DD, so string order is date order.
function checkSchedule(item: ItinerarySchedule, ctx: z.RefinementCtx) {
  const issue = (path: keyof ItinerarySchedule, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if ((item.startTime || item.endDate) && !item.startDate) issue("startDate", ITEM_DATE_MESSAGE);
  if (item.endTime && !item.endDate) issue("endDate", ITEM_DATE_MESSAGE);
  if (item.startTime && !item.startTimeZone) issue("startTimeZone", TIME_ZONE_MESSAGE);
  if (item.endTime && !item.endTimeZone) issue("endTimeZone", TIME_ZONE_MESSAGE);
  if (item.startDate && item.endDate && item.endDate < item.startDate) {
    issue("endDate", "El fin no puede ser anterior al inicio.");
  }
}

// A zone without a time says nothing: it is dropped, as the database requires.
function dropUnusedZones<T extends ItinerarySchedule>(item: T): T {
  return {
    ...item,
    startTimeZone: item.startTime ? item.startTimeZone : null,
    endTimeZone: item.endTime ? item.endTimeZone : null,
  };
}

// Trip item (tripId) or booking item (bookingId). A booking item takes its trip from the booking on
// the server, so a tripId sent with a bookingId is ignored.
export const itineraryItemFormSchema = z
  .object({
    tripId: blankToNull(z.uuid({ error: "El viaje no es válido." })),
    bookingId: blankToNull(z.uuid({ error: BOOKING_ID_MESSAGE })),
    ...itineraryItemFields,
  })
  .superRefine((item, ctx) => {
    if (!item.tripId && !item.bookingId) {
      ctx.addIssue({ code: "custom", path: ["tripId"], message: "Falta el viaje o la reserva." });
    }
    checkSchedule(item, ctx);
  })
  .overwrite((item) => dropUnusedZones({ ...item, tripId: item.bookingId ? null : item.tripId }));

// Where an item belongs never changes after creation.
export const updateItineraryItemSchema = z
  .object({ itemId: z.uuid({ error: "El hito no es válido." }), ...itineraryItemFields })
  .superRefine(checkSchedule)
  .overwrite(dropUnusedZones);

export const itemIdSchema = z.object({
  itemId: z.uuid({ error: "El hito no es válido." }),
});

export const tripUpdateFormSchema = z.object({
  tripId: z.uuid({ error: "El viaje no es válido." }),
  title: requiredText(3, 120, "El título debe tener entre 3 y 120 caracteres."),
  body: requiredText(1, 2000, "El mensaje debe tener entre 1 y 2000 caracteres."),
});

export const tripUpdateIdSchema = z.object({
  updateId: z.uuid({ error: "El aviso no es válido." }),
});
