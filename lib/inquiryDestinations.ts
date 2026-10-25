// Closed list of inquiry destinations, shared by the landing (selector and WhatsApp message) and
// the CRM (server-side validation of the web form). The id is the form value and the ?destino=
// value; name is the WhatsApp text and leads.destination_text; tripSlug links a catalog trip.
export const INQUIRY_DESTINATION_IDS = ["maraton-santiago-2027", "rio", "roma"] as const; // for z.enum

export type InquiryDestinationId = (typeof INQUIRY_DESTINATION_IDS)[number];

export const DEFAULT_INQUIRY_DESTINATION: InquiryDestinationId = "maraton-santiago-2027";

export const INQUIRY_DESTINATIONS: Record<InquiryDestinationId, { name: string; tripSlug: string | null }> = {
  "maraton-santiago-2027": { name: "Maratón de Santiago 42K 2027", tripSlug: "maraton-santiago-2027" },
  rio: { name: "Río de Janeiro", tripSlug: null },
  roma: { name: "Roma", tripSlug: null },
};
