// Versioned legal text of the web registration, shared by the CRM (version stored with the lead)
// and the landing (text shown in the form). Approved by the user on 2026-10-29 (gate P-L closed).
// Once published, any change of the text requires a new version.
export const REGISTRATION_CONSENT = {
  version: "registro-web-v1",
  isPlaceholder: false,
  privacyText:
    "Acepto que Carreras Viajeras use mis datos (nombre, WhatsApp y correo) para contactarme sobre esta carrera.",
  marketingText:
    "Quiero recibir novedades y promociones de futuros viajes de Carreras Viajeras.",
} as const;

// false in production while the text is a placeholder: no form, no save (the page and the action
// both check it). Development and test always stay open.
export function isRegistrationOpen(): boolean {
  return !REGISTRATION_CONSENT.isPlaceholder || process.env.NODE_ENV !== "production";
}
