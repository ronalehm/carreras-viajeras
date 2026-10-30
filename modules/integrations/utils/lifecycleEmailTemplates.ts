import type { clientEmailKindEnum } from "@/lib/db-schema";

// Fixed, reviewed texts of docs/specs/crm-lifecycle-emails.md («Textos para revisión»). Pure
// functions: recipients, sender and eligibility are resolved by clientEmails.service.ts.
export type LifecycleEmailKind = Exclude<(typeof clientEmailKindEnum.enumValues)[number], "stage">;

type ClientEmailData = { fullName: string; race: string };
// Internal alerts only carry name, race, entry channel/stage, the current owner's address (team
// alert) and the lead link: never phone, documents, medical or internal notes.
type TeamAlertData = ClientEmailData & {
  sourceLabel: string;
  ownerEmail: string | null;
  leadUrl: string;
};
type OwnerAlertData = ClientEmailData & { stageLabel: string; leadUrl: string };

export type LifecycleEmailData = {
  welcome_registration: ClientEmailData;
  welcome_contact: ClientEmailData;
  welcome_account: ClientEmailData;
  follow_up: ClientEmailData;
  booking_confirmed: ClientEmailData;
  team_alert: TeamAlertData;
  owner_alert: OwnerAlertData;
};

export type LifecycleEmail = { subject: string; body: string; templateVersion: 1 };

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

type Content = { subject: string; body: string };
type Builders = { [K in LifecycleEmailKind]: (data: LifecycleEmailData[K]) => Content };

const BUILDERS: Builders = {
  welcome_registration: ({ fullName, race }) => ({
    subject: `Recibimos tu registro para ${race}`,
    body: `Hola ${firstName(fullName)}, te damos la bienvenida a Carreras Viajeras. Recibimos tu registro para ${race}. Pronto una persona de nuestro equipo te escribirá por WhatsApp para contarte cómo es el viaje y resolver tus dudas. Si quieres adelantarnos algo, responde este correo.`,
  }),
  welcome_contact: ({ fullName, race }) => ({
    subject: "Recibimos tu consulta",
    body: `Hola ${firstName(fullName)}, te damos la bienvenida a Carreras Viajeras y gracias por escribirnos. Recibimos tu consulta sobre ${race}. Pronto una persona de nuestro equipo te contactará por WhatsApp. Si quieres añadir algo, responde este correo.`,
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
  const { subject, body } = BUILDERS[kind](data);
  return {
    subject: truncate(subject.replace(/\s+/g, " ").trim(), SUBJECT_MAX),
    body: `${truncate(body, BODY_MAX - SIGNATURE.length)}${SIGNATURE}`,
    templateVersion: 1,
  };
}
