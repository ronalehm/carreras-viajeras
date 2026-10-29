import { z } from "zod";
import { formatUsdPenRate, MAX_USD_AMOUNT, parseUsdPenRate } from "@/lib/currency";
import { blankToNull, requiredText, textList, wholeNumber } from "./trips.schema";

// Same values as the trip_offer_status enum in lib/db-schema.ts (kept in sync by offers.schema.test.ts).
export const offerStatusSchema = z.enum(["draft", "approved", "active", "closed"], {
  error: "El estado no es válido.",
});

export const offerIdSchema = z.uuid({ error: "La oferta no es válida." });

const NAME_MESSAGE = "Escribe un nombre interno de 2 a 80 caracteres.";
const TOTAL_PRICE_MESSAGE = "Indica el precio total en dólares, sin decimales.";
const DISCOUNT_MESSAGE = "Indica el descuento en dólares, sin decimales.";
const DEPOSIT_MESSAGE = "Indica cada anticipo en dólares, sin decimales, separados por comas.";
const DEPOSIT_COUNT_MESSAGE = "Indica como máximo 3 anticipos.";
const DATE_MESSAGE = "Indica una fecha válida.";
const VALID_FROM_MESSAGE = "Indica desde qué fecha es válido el precio.";
const BONUS_MESSAGE = "El beneficio debe tener entre 2 y 200 caracteres.";
const BONUS_MONEY_MESSAGE =
  "Un bono no es un descuento: descríbelo sin importes (p. ej. «Polo oficial de la carrera»).";
const CAPACITY_MESSAGE = "Indica un número entero de cupos entre 1 y 10,000.";
const TERMS_VERSION_MESSAGE =
  "Usa de 3 a 60 caracteres: minúsculas, números y guiones (p. ej. santiago-2027-v1).";
const CONDITIONS_MESSAGE = "Escribe las condiciones de pago y cancelación (de 10 a 2000 caracteres).";
const USD_PEN_MESSAGE = "Indica el tipo con punto decimal y hasta 4 decimales (p. ej. 3.7500).";

// A currency symbol or word next to a number (Decision 10): "US$ 50", "S/ 100", "50 dólares", "USD100".
const MONEY_AMOUNT_PATTERN =
  /(?:US\$|\$|S\/|\bUSD|\bPEN|\bd[oó]lares?|\bsoles?)\s*\d|\d\s*(?:US\$|\$|S\/|USD\b|PEN\b|d[oó]lares?\b|soles?\b)/i;

const wholeAmount = (min: number, max: number, message: string) =>
  wholeNumber(message).pipe(z.number().int().min(min, message).max(max, message));

const PRICE_FIELDS: PropertyKey[] = ["totalPriceUsd", "discountUsd"];
const DEPOSIT_FIELDS: PropertyKey[] = [...PRICE_FIELDS, "depositOptionsUsd"];
const BALANCE_FIELDS: PropertyKey[] = ["depositOptionsUsd", "balanceDueOn"];
const VALIDITY_FIELDS: PropertyKey[] = ["validFrom", "validUntil"];

// Input: the strings of Object.fromEntries(formData). z.object drops unknown keys such as status,
// version, finalPriceUsd, approvedBy or price: no amount or state comes from the client.
export const offerFormSchema = z
  .object({
    name: requiredText(2, 80, NAME_MESSAGE),
    totalPriceUsd: z
      .string({ error: TOTAL_PRICE_MESSAGE })
      .trim()
      .pipe(wholeAmount(1, MAX_USD_AMOUNT, TOTAL_PRICE_MESSAGE)),
    // Blank (or missing) means no discount.
    discountUsd: z
      .string()
      .optional()
      .transform((value = "") => value.trim() || "0")
      .pipe(wholeAmount(0, MAX_USD_AMOUNT, DISCOUNT_MESSAGE)),
    // "200, 100, ,100" → [100, 200]: deduplicated and sorted; blank means a single payment.
    depositOptionsUsd: textList(",")
      .pipe(z.array(wholeAmount(1, MAX_USD_AMOUNT, DEPOSIT_MESSAGE)))
      .transform((deposits) => [...new Set(deposits)].sort((a, b) => a - b))
      .pipe(z.array(z.number()).max(3, DEPOSIT_COUNT_MESSAGE)),
    balanceDueOn: blankToNull(z.iso.date({ error: DATE_MESSAGE })),
    bonusDescription: blankToNull(
      z
        .string()
        .min(2, BONUS_MESSAGE)
        .max(200, BONUS_MESSAGE)
        .refine((bonus) => !MONEY_AMOUNT_PATTERN.test(bonus), BONUS_MONEY_MESSAGE),
    ),
    validFrom: z.iso.date({ error: VALID_FROM_MESSAGE }),
    validUntil: blankToNull(z.iso.date({ error: DATE_MESSAGE })),
    capacityLimit: blankToNull(wholeAmount(1, 10_000, CAPACITY_MESSAGE)),
    termsVersion: z
      .string({ error: TERMS_VERSION_MESSAGE })
      .trim()
      .toLowerCase()
      .min(3, TERMS_VERSION_MESSAGE)
      .max(60, TERMS_VERSION_MESSAGE)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, TERMS_VERSION_MESSAGE),
    conditions: requiredText(10, 2000, CONDITIONS_MESSAGE),
  })
  .superRefine((offer, ctx) => {
    // Zod still runs this refinement when a field failed: each rule compares only valid fields.
    const failed = (fields: PropertyKey[]) =>
      ctx.issues.some((issue) => fields.includes(issue.path?.[0] ?? ""));

    const pricesValid = !failed(PRICE_FIELDS);
    if (pricesValid && offer.discountUsd >= offer.totalPriceUsd) {
      ctx.addIssue({
        code: "custom",
        path: ["discountUsd"],
        message: "El descuento debe ser menor que el precio total.",
      });
    } else if (pricesValid && !failed(DEPOSIT_FIELDS)) {
      const finalPriceUsd = offer.totalPriceUsd - offer.discountUsd;
      if (offer.depositOptionsUsd.some((deposit) => deposit >= finalPriceUsd)) {
        ctx.addIssue({
          code: "custom",
          path: ["depositOptionsUsd"],
          message: "Cada anticipo debe ser menor que el precio final.",
        });
      }
    }

    if (!failed(BALANCE_FIELDS)) {
      const hasDeposits = offer.depositOptionsUsd.length > 0;
      if (hasDeposits && offer.balanceDueOn === null) {
        ctx.addIssue({
          code: "custom",
          path: ["balanceDueOn"],
          message: "Indica hasta cuándo se paga el saldo.",
        });
      } else if (!hasDeposits && offer.balanceDueOn !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["balanceDueOn"],
          message: "Sin anticipos no hay saldo: deja la fecha vacía.",
        });
      }
    }

    // ISO dates (YYYY-MM-DD) compare correctly as strings.
    if (!failed(VALIDITY_FIELDS) && offer.validUntil !== null && offer.validUntil < offer.validFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "La fecha final no puede ser anterior a la inicial.",
      });
    }
  });

// safeExtend keeps the refinement of offerFormSchema. The scope (trip and optional campaign) is
// chosen only when the offer is created: the update schema has no tripId or campaignId.
export const createOfferSchema = offerFormSchema.safeExtend({
  tripId: z.uuid({ error: "Elige un viaje del catálogo." }),
  campaignId: blankToNull(z.uuid({ error: "Elige una campaña activa de ese viaje." })),
});

export const updateOfferSchema = offerFormSchema.safeExtend({ id: offerIdSchema });

export const offerTransitionSchema = z.object({ offerId: offerIdSchema });

// "3.75" → "3.7500" (the numeric(10,4) text Drizzle stores and reads back).
export const exchangeRateFormSchema = z.object({
  usdPen: z
    .string({ error: USD_PEN_MESSAGE })
    .trim()
    .transform((value, ctx) => {
      const rateE4 = parseUsdPenRate(value);
      if (rateE4 === null) {
        ctx.addIssue({ code: "custom", message: USD_PEN_MESSAGE });
        return z.NEVER;
      }
      return formatUsdPenRate(rateE4);
    }),
});
