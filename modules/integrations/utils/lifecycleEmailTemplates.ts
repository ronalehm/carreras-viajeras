import type { clientEmailKindEnum } from "@/lib/db-schema";
import { formatCadenceDate, formatCadenceUsd } from "./cadenceEmailTemplates";

// Fixed, reviewed texts of docs/specs/crm-lifecycle-emails.md («Textos para revisión»). Pure
// functions: recipients, sender and eligibility are resolved by clientEmails.service.ts. The sales
// cadence kinds have their own templates (crm-sales-cadence.md). The «Crea tu cuenta» block of the
// welcomes comes from docs/specs/crm-welcome-discount.md («Textos para revisión»).
export type LifecycleEmailKind = Exclude<
  (typeof clientEmailKindEnum.enumValues)[number],
  "stage" | "cadence_proposal" | "cadence_reminder"
>;

type ClientEmailData = { fullName: string; race: string };
// Welcome discount code issued by clientEmails.service.ts (crm-welcome-discount.md, requirement 3).
// expiresOn is a calendar date (YYYY-MM-DD); accountUrl is {APP_ORIGIN}/cuenta.
export type WelcomeCodeEmailData = { code: string; amountUsd: number; expiresOn: string; accountUrl: string };
type WelcomeEmailData = ClientEmailData & { welcomeCode?: WelcomeCodeEmailData };
// Internal alerts only carry name, race, entry channel/stage, the current owner's address (team
// alert) and the lead link: never phone, documents, medical or internal notes.
type TeamAlertData = ClientEmailData & {
  sourceLabel: string;
  ownerEmail: string | null;
  leadUrl: string;
};
type OwnerAlertData = ClientEmailData & { stageLabel: string; leadUrl: string };

export type LifecycleEmailData = {
  welcome_registration: WelcomeEmailData;
  welcome_contact: WelcomeEmailData;
  welcome_account: ClientEmailData;
  follow_up: ClientEmailData;
  booking_confirmed: ClientEmailData;
  team_alert: TeamAlertData;
  owner_alert: OwnerAlertData;
};

// templateVersion 2: a welcome with the welcome code block; every other email keeps version 1.
export type LifecycleEmail = { subject: string; body: string; templateVersion: 1 | 2 };

// client_emails_content_chk: subject 1–200 and body 1–4000 characters (code points). The subject is
// a single line: {carrera} can come from the free text destination_text.
const SUBJECT_MAX = 200;
const BODY_MAX = 4000;
const SIGNATURE = "\n\nEquipo de Carreras Viajeras";

const clean = (value: string | null | undefined) => value?.trim() || null;

// Same rule as clientEmailTemplate (stage emails): first word of the name, or «viajero».
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "viajero";
}

export function raceLabel({
  tripTitle,
  destinationText,
}: {
  tripTitle?: string | null;
  destinationText?: string | null;
}): string {
  return clean(tripTitle) ?? clean(destinationText) ?? "tu próxima carrera";
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

// Plain text: the bold of the reviewed text is omitted and the bullets are written with «- ».
function welcomeCodeBlock({ code, amountUsd, expiresOn, accountUrl }: WelcomeCodeEmailData): string {
  const amount = formatCadenceUsd(amountUsd);
  return [
    `Crea tu cuenta y llévate ${amount} de descuento`,
    "Con tu cuenta de Carreras Viajeras tienes:",
    "- Mis carreras: tus reservas, pagos y saldo en un solo lugar.",
    "- Recompensas: acumula estrellas por tus viajes y referidos, y canjéalas por descuentos y beneficios.",
    "- Novedades primero: entérate antes que nadie de nuevas carreras y preventas.",
    "",
    `Tu código de bienvenida es ${code}: ${amount} de descuento en tu primera reserva. Para usarlo, crea tu cuenta con este mismo correo en ${accountUrl} y compártelo con nuestro equipo al reservar. Válido hasta el ${formatCadenceDate(expiresOn)}.`,
  ].join("\n");
}

// accountBlock goes after the body and before the signature.
type Content = { subject: string; body: string; accountBlock?: string };
type Builders = { [K in LifecycleEmailKind]: (data: LifecycleEmailData[K]) => Content };

const BUILDERS: Builders = {
  welcome_registration: ({ fullName, race, welcomeCode }) => ({
    subject: `Recibimos tu registro para ${race}`,
    body: `Hola ${firstName(fullName)}, te damos la bienvenida a Carreras Viajeras. Recibimos tu registro para ${race}. Pronto una persona de nuestro equipo te escribirá por WhatsApp para contarte cómo es el viaje y resolver tus dudas. Si quieres adelantarnos algo, responde este correo.`,
    accountBlock: welcomeCode && welcomeCodeBlock(welcomeCode),
  }),
  welcome_contact: ({ fullName, race, welcomeCode }) => ({
    subject: "Recibimos tu consulta",
    body: `Hola ${firstName(fullName)}, te damos la bienvenida a Carreras Viajeras y gracias por escribirnos. Recibimos tu consulta sobre ${race}. Pronto una persona de nuestro equipo te contactará por WhatsApp. Si quieres añadir algo, responde este correo.`,
    accountBlock: welcomeCode && welcomeCodeBlock(welcomeCode),
  }),
  welcome_account: ({ fullName }) => ({
    subject: "Te damos la bienvenida a Carreras Viajeras",
    body: `Hola ${firstName(fullName)}, tu cuenta y tu perfil de runner ya están listos. Desde tu cuenta podrás ver tus carreras y mantener tus datos al día. Una persona de nuestro equipo te escribirá para ayudarte a elegir tu próximo viaje. Si tienes una consulta, responde este correo.`,
  }),
  follow_up: ({ fullName, race }) => ({
    subject: `¿Seguimos con tu viaje a ${race}?`,
    body: `Hola ${firstName(fullName)}, queríamos saber cómo vas con tu decisión sobre ${race}. Si tienes dudas o necesitas más información, responde este correo y te ayudamos.`,
  }),
  booking_confirmed: ({ fullName, race }) => ({
    subject: `Tu separación para ${race} está confirmada`,
    body: `Hola ${firstName(fullName)}, confirmamos tu separación para ${race}. Nuestro equipo te escribirá para coordinar los siguientes pasos. Si tienes una consulta, responde este correo.`,
  }),
  team_alert: ({ fullName, race, sourceLabel, ownerEmail, leadUrl }) => ({
    subject: `Nuevo registro: ${firstName(fullName)} · ${race}`,
    body: [
      "Entró un registro nuevo al embudo.",
      `Nombre: ${fullName.trim()}`,
      `Carrera: ${race}`,
      `Vía de entrada: ${sourceLabel}`,
      `Responsable: ${clean(ownerEmail) ?? "sin asignar"}`,
      `Ficha: ${leadUrl}`,
    ].join("\n"),
  }),
  owner_alert: ({ fullName, race, stageLabel, leadUrl }) => ({
    subject: `Te asignaron un lead: ${firstName(fullName)}`,
    body: [
      "Te asignaron un lead en el CRM.",
      `Nombre: ${fullName.trim()}`,
      `Carrera: ${race}`,
      `Etapa: ${stageLabel}`,
      `Ficha: ${leadUrl}`,
    ].join("\n"),
  }),
};

export function lifecycleEmailTemplate<K extends LifecycleEmailKind>(
  kind: K,
  data: LifecycleEmailData[K],
): LifecycleEmail {
  const { subject, body, accountBlock } = BUILDERS[kind](data);
  // Only the free body is truncated, so the code block and the signature always reach the client. The
  // block is bounded (fixed code format, amount up to 10 000, date and APP_ORIGIN), far below the limit.
  const tail = `${accountBlock ? `\n\n${accountBlock}` : ""}${SIGNATURE}`;
  return {
    subject: truncate(subject.replace(/\s+/g, " ").trim(), SUBJECT_MAX),
    body: `${truncate(body, BODY_MAX - Array.from(tail).length)}${tail}`,
    templateVersion: accountBlock ? 2 : 1,
  };
}
