// Dato público del canal comercial (+51 938 127 170).
export const WHATSAPP_NUMBER = "51938127170";

/** Texto fijo de WhatsApp como alternativa al formulario (sin datos personales). */
export const GENERAL_INQUIRY_MESSAGE = "Hola, quiero información para correr con Carreras Viajeras.";

const ATTRIBUTION_KEYS = ["c", "utm_source", "utm_medium", "utm_campaign", "ref"] as const;
const MAX_ATTRIBUTION_LENGTH = 200;

// Enlaces antiguos de `?destino=` que siguen funcionando (la portada de `main` usa santiago-2027).
const DESTINATION_ALIASES = new Map([["santiago-2027", "maraton-santiago-2027"]]);

export type LeadAttributionParams = Partial<Record<(typeof ATTRIBUTION_KEYS)[number], string>>;

/** Primer valor de un parámetro de búsqueda (`?x=a&x=b` → "a"). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `?c=`, UTM y `ref` para los campos ocultos del formulario: solo esas cinco claves, su primer
 * valor, no vacío y de 200 caracteres como máximo. No son de confianza: el servidor los normaliza
 * y decide la atribución.
 */
export function attributionParams(
  searchParams: Record<string, string | string[] | undefined>,
): LeadAttributionParams {
  const params: LeadAttributionParams = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = firstParam(searchParams[key]);
    if (value?.trim() && value.length <= MAX_ATTRIBUTION_LENGTH) params[key] = value;
  }
  return params;
}

/** `/viajes/<slug>/registro` con los parámetros de atribución presentes; sin parámetros, sin `?`. */
export function registrationHref(slug: string, params: LeadAttributionParams): string {
  const query = new URLSearchParams();
  for (const key of ATTRIBUTION_KEYS) {
    const value = params[key];
    if (value !== undefined) query.append(key, value);
  }
  const search = query.toString();
  return `/viajes/${slug}/registro${search ? `?${search}` : ""}`;
}

/** `?destino=` → un valor permitido, su alias si está permitido, o "" (sin preselección). */
export function resolveDestination(
  value: string | string[] | undefined,
  allowed: readonly string[],
): string {
  const destination = firstParam(value);
  if (destination === undefined) return "";
  if (allowed.includes(destination)) return destination;
  const alias = DESTINATION_ALIASES.get(destination);
  return alias !== undefined && allowed.includes(alias) ? alias : "";
}

/** Consulta por WhatsApp desde la página de un viaje del catálogo (sin precio, para no quedar desfasada). */
export function buildTripInquiryMessage(input: {
  title: string;
  raceDate: string;
  location: string;
}): string {
  return [
    `Hola, me interesa el viaje ${input.title} (${input.raceDate}, ${input.location}). Quisiera conocer disponibilidad, inclusiones y condiciones finales.`,
    "Entiendo que esta consulta no constituye reserva ni pago.",
  ].join("\n");
}

/** Enlace `wa.me` con el texto codificado, o `null` si el número no es válido. */
export function buildWhatsAppUrl(number: string, text: string): string | null {
  const digits = number.replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
