// Inquiry destinations without a catalog trip, shared by the landing (/contacto selector, after
// the published trips) and the CRM (web capture). The id is the form value and the ?destino=
// value; name is the visible label and leads.destination_text. Catalog trips (Santiago included)
// come from the published catalog, never from this list.
export const INQUIRY_DESTINATION_IDS = ["rio", "roma"] as const;

export type InquiryDestinationId = (typeof INQUIRY_DESTINATION_IDS)[number];

export const INQUIRY_DESTINATIONS: Record<InquiryDestinationId, { name: string }> = {
  rio: { name: "Río de Janeiro" },
  roma: { name: "Roma" },
};
