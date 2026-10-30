import { firstName } from "./lifecycleEmailTemplates";

// Fixed, reviewed texts of docs/specs/crm-sales-cadence.md («Textos para revisión»). Pure functions:
// the offer, links, recipient and eligibility are resolved by clientEmails.service.ts. {carrera} is
// expected already resolved with raceLabel (lifecycleEmailTemplates.ts).
//
// Missing data never leaves a dangling placeholder:
// - Offer (proposal): each sentence whose datum is missing is omitted. Without deposit options the
//   deposit sentence is omitted together with the balance; with a deposit but no balance date only
//   the «y completar el saldo…» fragment is dropped.
// - {enlace_viaje} = null: the sentence or fragment pointing to the trip page is omitted.
// - {whatsapp} = null: «por WhatsApp» and «: {whatsapp}» are dropped; «responde este correo o
//   escríbenos por WhatsApp: {whatsapp}» becomes «responde este correo» (the reply is the channel
//   left). In the proposal with offer, the «o escríbenos por WhatsApp…» fragment is dropped.
//   Blank strings count as null.

export type CadenceStage = "new" | "contacted" | "quoted";
export type CadenceStep = "proposal" | "r3" | "r5" | "r7"; // proposal only exists for "new"

// Only the fields of ActiveOffer (modules/trips/types/offers.types.ts) that the proposal shows. Kept
// here so these pure templates do not depend on trips; clientEmails.service.ts maps the offer from the
// public API of trips (getActiveOffer). Amounts in USD; dates are calendar dates (YYYY-MM-DD).
export type CadenceOffer = {
  finalPriceUsd: number;
  depositOptionsUsd: number[];
  balanceDueOn: string | null;
  bonusDescription: string | null;
  validUntil: string | null;
};

export type CadenceEmailInput = {
  stage: CadenceStage;
  step: CadenceStep;
  fullName: string;
  race: string;
  tripUrl: string | null;
  whatsappUrl: string | null;
  offer: CadenceOffer | null;
};

export type CadenceEmail = { subject: string; body: string; templateVersion: 1 };

// client_emails_content_chk: subject 1–200 and body 1–4000 characters (code points). Same limits,
// signature and single-line subject as lifecycleEmailTemplate.
const SUBJECT_MAX = 200;
const BODY_MAX = 4000;
const SIGNATURE = "\n\nEquipo de Carreras Viajeras";

const clean = (value: string | null | undefined) => value?.trim() || null;

// Same as the (non-exported) truncate of lifecycleEmailTemplates.ts.
function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

// Grouping only; decimals are built from integer cents, so the output does not depend on ICU rounding.
const groupedInteger = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

// 1499 → "US$1,499"; 1499.5 → "US$1,499.50".
export function formatCadenceUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError("amount must be a non-negative number");
  if (Number.isInteger(amount)) return `US$${groupedInteger.format(amount)}`;
  const cents = Math.round(amount * 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return `US$${groupedInteger.format(Math.floor(cents / 100))}.${fraction}`;
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// "2027-03-15" → "15 de marzo de 2027". The string is parsed as is (no Date), so the server time zone
// cannot shift the day.
export function formatCadenceDate(date: string): string {
  const match = CALENDAR_DATE.exec(date);
  const month = match ? Number(match[2]) : 0;
  const day = match ? Number(match[3]) : 0;
  if (!match || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError("date must be a calendar date (YYYY-MM-DD)");
  }
  return `${day} de ${MONTHS[month - 1]} de ${match[1]}`;
}

// The bonus is shown as written, ending in a period.
function bonusSentence(bonus: string | null): string | null {
  const text = clean(bonus);
  if (!text) return null;
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

function depositSentence(offer: CadenceOffer): string | null {
  if (offer.depositOptionsUsd.length === 0) return null;
  const deposit = formatCadenceUsd(Math.min(...offer.depositOptionsUsd));
  const balance = clean(offer.balanceDueOn);
  return balance
    ? `Puedes separar tu cupo con ${deposit} y completar el saldo hasta el ${formatCadenceDate(balance)}.`
    : `Puedes separar tu cupo con ${deposit}.`;
}

type Context = { name: string; race: string; trip: string | null; wa: string | null; offer: CadenceOffer | null };
type Content = { subject: string; body: string };

const join = (...parts: (string | null)[]) => parts.filter((part): part is string => Boolean(part)).join(" ");

// «responde este correo o escríbenos por WhatsApp: {whatsapp}.», or «responde este correo.» without it.
function replyOrWhatsapp(wa: string | null): string {
  return wa ? `responde este correo o escríbenos por WhatsApp: ${wa}.` : "responde este correo.";
}

function proposalWithOffer({ name, race, trip, wa }: Context, offer: CadenceOffer): string {
  const validUntil = clean(offer.validUntil);
  const links =
    trip && wa
      ? `Mira todos los detalles en ${trip} o escríbenos por WhatsApp: ${wa}.`
      : trip
        ? `Mira todos los detalles en ${trip}.`
        : wa
          ? `Escríbenos por WhatsApp: ${wa}.`
          : null;
  return join(
    `Hola ${name}, te compartimos la propuesta para correr ${race} con Carreras Viajeras.`,
    `Precio final: ${formatCadenceUsd(offer.finalPriceUsd)}.`,
    depositSentence(offer),
    bonusSentence(offer.bonusDescription),
    validUntil ? `Esta oferta es válida hasta el ${formatCadenceDate(validUntil)}.` : null,
    links,
  );
}

function proposalWithoutOffer({ name, race, trip, wa }: Context): string {
  const ask =
    trip && wa
      ? `Mira qué incluye el viaje en ${trip} y escríbenos por WhatsApp para prepararte una propuesta a tu medida: ${wa}.`
      : trip
        ? `Mira qué incluye el viaje en ${trip} y escríbenos para prepararte una propuesta a tu medida.`
        : wa
          ? `Escríbenos por WhatsApp para prepararte una propuesta a tu medida: ${wa}.`
          : "Escríbenos para prepararte una propuesta a tu medida.";
  return `Hola ${name}, queremos ayudarte a correr ${race}. ${ask}`;
}

type Templates = { [S in CadenceStage]: Partial<Record<CadenceStep, (ctx: Context) => Content>> };

const TEMPLATES: Templates = {
  new: {
    proposal: (ctx) => ({
      subject: `Tu propuesta para ${ctx.race}`,
      body: ctx.offer ? proposalWithOffer(ctx, ctx.offer) : proposalWithoutOffer(ctx),
    }),
    r3: ({ name, race, wa }) => ({
      subject: `¿Pudiste revisar la propuesta para ${race}?`,
      body: `Hola ${name}, ¿pudiste revisar la propuesta? Si tienes dudas sobre el viaje, las fechas o la forma de pago, ${replyOrWhatsapp(wa)}`,
    }),
    r5: ({ name, race, trip, wa }) => {
      const help = wa
        ? `te llamamos o te escribimos por WhatsApp para resolver tus dudas: ${wa}.`
        : "te llamamos o te escribimos para resolver tus dudas.";
      return {
        subject: `Lo que incluye tu viaje a ${race}`,
        body: trip
          ? `Hola ${name}, te recordamos que el viaje a ${race} incluye lo que ves en ${trip}. Si quieres, ${help}`
          : `Hola ${name}, si quieres, ${help}`,
      };
    },
    r7: ({ name, race }) => ({
      subject: `¿Seguimos con ${race}?`,
      body: `Hola ${name}, no queremos insistir de más. Si todavía te interesa correr ${race}, responde este correo y retomamos. Si ahora no es buen momento, también nos ayuda saberlo.`,
    }),
  },
  contacted: {
    r3: ({ name, race, wa }) => ({
      subject: `Sobre tu viaje a ${race}`,
      body: `Hola ${name}, gracias por conversar con nosotros. ¿Te quedó alguna duda sobre el viaje a ${race}? ${
        wa ? `Responde este correo o escríbenos por WhatsApp: ${wa}.` : "Responde este correo."
      }`,
    }),
    r5: ({ name, race }) => ({
      subject: "¿Te preparamos tu cotización?",
      body: `Hola ${name}, si quieres, preparamos tu cotización para ${race} con las opciones de pago disponibles. Solo responde este correo.`,
    }),
    r7: ({ name, race }) => ({
      subject: "¿Seguimos en contacto?",
      body: `Hola ${name}, si todavía te interesa ${race}, aquí estamos para ayudarte. Si ahora no es buen momento, respóndenos y te escribimos más adelante.`,
    }),
  },
  quoted: {
    r3: ({ name, race, wa }) => ({
      subject: `¿Revisaste tu cotización para ${race}?`,
      body: `Hola ${name}, ¿pudiste revisar tu cotización? Si quieres ajustar algo o tienes dudas sobre la separación del cupo, ${replyOrWhatsapp(wa)}`,
    }),
    r5: ({ name, race, wa }) => ({
      subject: `Separa tu cupo para ${race}`,
      body: `Hola ${name}, para asegurar tu lugar en ${race} puedes separar tu cupo. ${
        wa ? `Te ayudamos con el proceso por WhatsApp: ${wa}.` : "Te ayudamos con el proceso."
      }`,
    }),
    r7: ({ name, race }) => ({
      subject: `Última consulta sobre ${race}`,
      body: `Hola ${name}, queremos saber si sigues interesado en ${race}. Responde este correo y te ayudamos con la reserva. Si decidiste no viajar esta vez, también nos ayuda saberlo.`,
    }),
  },
};

export function cadenceEmailTemplate(input: CadenceEmailInput): CadenceEmail {
  const build = TEMPLATES[input.stage]?.[input.step];
  if (!build) throw new Error(`No cadence template for ${input.stage}/${input.step}`);
  const { subject, body } = build({
    name: firstName(input.fullName),
    race: input.race,
    trip: clean(input.tripUrl),
    wa: clean(input.whatsappUrl),
    offer: input.offer,
  });
  return {
    subject: truncate(subject.replace(/\s+/g, " ").trim(), SUBJECT_MAX),
    body: `${truncate(body, BODY_MAX - SIGNATURE.length)}${SIGNATURE}`,
    templateVersion: 1,
  };
}
