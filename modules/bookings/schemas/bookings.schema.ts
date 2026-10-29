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
// runnerUserId, status or createdBy: they never come from the form. leadId comes from the hidden
// field of "Crear reserva" in the lead's page; blank means a booking without lead.
export const bookingFormSchema = z.object({
  tripId: z.uuid({ error: "Elige un viaje." }),
  leadId: blankToNull(z.uuid({ error: "El lead indicado no es válido." })),
  ...bookingFields,
});

// The trip and the lead link cannot change after creation.
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
  requestKey: z.uuid({ error: "La solicitud de pago no es válida. Recarga el formulario." }),
  amountUsd: usdIntegerSchema(1, "Indica el importe en dólares, sin decimales."),
  paidOn: z.iso.date({ error: DATE_MESSAGE }),
  concept: requiredText(1, 80, "El concepto debe tener entre 1 y 80 caracteres."),
});

export const paymentVoidSchema = z.object({
  paymentId: z.uuid({ error: "El pago no es válido." }),
});
