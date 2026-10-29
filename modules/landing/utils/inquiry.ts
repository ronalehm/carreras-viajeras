export const DESTINATION_IDS = ["santiago-2027", "rio", "roma"] as const;
export type DestinationId = (typeof DESTINATION_IDS)[number];

// Dato público del canal comercial (+51 938 127 170).
export const WHATSAPP_NUMBER = "51938127170";

const DESTINATION_NAMES: Record<DestinationId, string> = {
  "santiago-2027": "Maratón de Santiago 42K 2027",
  rio: "Río de Janeiro",
  roma: "Roma",
};

/** `?destino=` → id válido o "santiago-2027". */
export function parseDestinationId(value: unknown): DestinationId {
  return DESTINATION_IDS.find((id) => id === value) ?? "santiago-2027";
}

/** Plantilla literal de la consulta del diseño (`app.js`). */
export function buildInquiryMessage(input: {
  name: string;
  email: string;
  phone: string;
  destination: DestinationId;
}): string {
  const clause =
    input.destination === "santiago-2027"
      ? " y la preventa por corredor: US$1,499 al contado o US$1,799 en cuotas, con reserva anunciada de US$300"
      : " cuando haya una propuesta confirmada";
  return [
    `Hola, soy ${input.name}. Me interesa ${DESTINATION_NAMES[input.destination]}${clause}. Quisiera conocer disponibilidad, inclusiones y condiciones finales.`,
    `Correo: ${input.email}`,
    `WhatsApp: ${input.phone}`,
    "Entiendo que esta consulta no constituye reserva ni pago.",
  ].join("\n");
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
