// Versioned legal text of the web registration, shared by the CRM (version stored with the lead)
// and the landing (text shown in the form). The legal area approves it (gate P-L).
// Replacing the placeholder: version "registro-web-v1" and isPlaceholder false (build mode, one
// file). Once published, any change of the text requires a new version.
export const REGISTRATION_CONSENT = {
  version: "registro-web-pendiente-pl",
  isPlaceholder: true,
  privacyText:
    "[TEXTO PROVISIONAL – PENDIENTE DE APROBACIÓN LEGAL (P-L)] Acepto que Carreras Viajeras use mis datos (nombre, WhatsApp y correo) para contactarme sobre esta carrera.",
  marketingText:
    "[TEXTO PROVISIONAL – P-L] Quiero recibir novedades y promociones de futuros viajes de Carreras Viajeras.",
} as const;

// false in production while the text is a placeholder: no form, no save (the page and the action
// both check it). Development and test keep working so the placeholder can be seen and tested.
export function isRegistrationOpen(): boolean {
  return !REGISTRATION_CONSENT.isPlaceholder || process.env.NODE_ENV !== "production";
}
