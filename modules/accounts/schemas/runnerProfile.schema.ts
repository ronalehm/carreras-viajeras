import { z } from "zod";
import { blankToNull, e164PhoneSchema, requiredText } from "@/lib/form-schema";

const DOCUMENT_TYPE_MESSAGE = "Elige el tipo de documento.";

// Same values as the database enums in lib/db-schema.ts (kept in sync by runnerProfile.schema.test.ts).
export const travelDocumentTypeSchema = z.enum(["passport", "national_id", "foreign_id"], {
  error: DOCUMENT_TYPE_MESSAGE,
});
export const shirtSizeSchema = z.enum(["xs", "s", "m", "l", "xl", "xxl"], {
  error: "Elige una talla de polo válida.",
});
export const raceDistanceSchema = z.enum(["5k", "10k", "21k", "42k", "ultra"], {
  error: "Elige una distancia válida.",
});

// Every message is a fixed text: none includes the submitted value (Requirement 7).
const PHONE_MESSAGE = "Escribe el número con código de país, p. ej. +51 938 127 170.";
const BIRTH_DATE_MESSAGE = "Indica una fecha de nacimiento válida.";
const DOCUMENT_NUMBER_MESSAGE = "Usa entre 4 y 20 letras o números.";

// Optional text, already trimmed by blankToNull.
const lengthText = (min: number, max: number, message: string) =>
  z.string().min(min, message).max(max, message);

// Fields checked together by the group refinement (Decision 6).
const GROUP_FIELDS: ReadonlySet<unknown> = new Set([
  "documentType",
  "documentNumber",
  "documentExpiresOn",
  "emergencyContactName",
  "emergencyContactPhone",
]);

// `today` (YYYY-MM-DD, UTC day; Decision 15) is a parameter so tests are deterministic.
// Input: the strings of Object.fromEntries(formData). z.object drops unknown keys such as
// userId, email, consentVersion or createdAt: they never come from the form.
export const runnerProfileFormSchema = (today: string) =>
  z
    .object({
      fullName: requiredText(2, 120, "El nombre debe tener entre 2 y 120 caracteres."),
      phone: e164PhoneSchema(PHONE_MESSAGE),
      country: blankToNull(lengthText(2, 80, "El país debe tener entre 2 y 80 caracteres.")),
      city: blankToNull(lengthText(2, 80, "La ciudad debe tener entre 2 y 80 caracteres.")),
      birthDate: blankToNull(
        z.iso
          .date({ error: BIRTH_DATE_MESSAGE, abort: true })
          .refine((value) => value >= "1900-01-01" && value <= today, BIRTH_DATE_MESSAGE),
      ),
      documentType: blankToNull(travelDocumentTypeSchema),
      // Without spaces, dots or dashes, uppercased (Decision 7).
      documentNumber: blankToNull(
        z
          .string()
          .transform((value) => value.replace(/[\s.-]/g, "").toUpperCase())
          .pipe(z.string().regex(/^[A-Z0-9]{4,20}$/, DOCUMENT_NUMBER_MESSAGE)),
      ),
      documentExpiresOn: blankToNull(
        z.iso
          .date({ error: "Indica una fecha de vencimiento válida.", abort: true })
          .refine((value) => value >= today, "La fecha de vencimiento ya pasó."),
      ),
      shirtSize: blankToNull(shirtSizeSchema),
      preferredDistance: blankToNull(raceDistanceSchema),
      personalBest: blankToNull(z.string().max(60, "La mejor marca puede tener hasta 60 caracteres.")),
      club: blankToNull(z.string().max(80, "El club puede tener hasta 80 caracteres.")),
      emergencyContactName: blankToNull(
        lengthText(2, 120, "El nombre del contacto debe tener entre 2 y 120 caracteres."),
      ),
      emergencyContactPhone: blankToNull(e164PhoneSchema(PHONE_MESSAGE)),
      medicalNotes: blankToNull(z.string().max(500, "Puedes escribir hasta 500 caracteres.")),
      // Required on every save; never reaches the service (the version is a server constant).
      consent: z.literal("on", { error: "Para guardar tu perfil, acepta el uso de tus datos." }),
    })
    .superRefine(
      (profile, ctx) => {
        const hasDocument = profile.documentNumber !== null;
        if (profile.documentType !== null && !hasDocument) {
          ctx.addIssue({ code: "custom", path: ["documentNumber"], message: "Indica el número del documento." });
        }
        if (profile.documentType === null && (hasDocument || profile.documentExpiresOn !== null)) {
          ctx.addIssue({ code: "custom", path: ["documentType"], message: DOCUMENT_TYPE_MESSAGE });
        }
        if (profile.emergencyContactName !== null && profile.emergencyContactPhone === null) {
          ctx.addIssue({
            code: "custom",
            path: ["emergencyContactPhone"],
            message: "Indica el teléfono del contacto de emergencia.",
          });
        }
        if (profile.emergencyContactPhone !== null && profile.emergencyContactName === null) {
          ctx.addIssue({
            code: "custom",
            path: ["emergencyContactName"],
            message: "Indica el nombre del contacto de emergencia.",
          });
        }
      },
      // Runs even when other fields fail, so the form shows every error at once; it only needs
      // the group fields to have parsed (otherwise their own errors are already shown).
      { when: (payload) => payload.issues.every((issue) => !GROUP_FIELDS.has(issue.path?.[0])) },
    );
