// Pure: no server-only, client components import these labels and texts.
import type {
  ProfileSection,
  RaceDistance,
  RunnerProfile,
  ShirtSize,
  TravelDocumentType,
} from "../types/runnerProfile.types";
import { CRM_TIME_ZONE } from "./staffDisplay";

export const DOCUMENT_TYPE_LABELS: Record<TravelDocumentType, string> = {
  passport: "Pasaporte",
  national_id: "DNI o documento nacional",
  foreign_id: "Carné de extranjería",
};

// Unisex sizes.
export const SHIRT_SIZE_LABELS: Record<ShirtSize, string> = {
  xs: "XS",
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
  xxl: "XXL",
};

export const RACE_DISTANCE_LABELS: Record<RaceDistance, string> = {
  "5k": "5K",
  "10k": "10K",
  "21k": "21K",
  "42k": "42K",
  ultra: "Ultra",
};

export const PROFILE_SECTION_LABELS: Record<ProfileSection, string> = {
  personal: "Datos personales",
  document: "Documento de viaje",
  race: "Datos de carrera",
  emergency: "Contacto de emergencia",
};

// The form shows `text` and the service saves `version`: changing the text requires a new version.
export const RUNNER_PROFILE_CONSENT = {
  version: "runner-profile-2026-10",
  text: "Acepto que Carreras Viajeras guarde estos datos, incluidos mi documento y mi información médica, para organizar mis viajes. Solo los ve el equipo de Carreras Viajeras.",
} as const;

export const SENSITIVE_DATA_NOTICE =
  "Dato sensible: solo lo ve el equipo de Carreras Viajeras para gestionar tu viaje.";

// Requirement 5: derived on read, never stored. Optional fields (preferred distance, personal
// best, club, medical notes) do not count. A document expiring today is still valid.
export function getMissingProfileSections(
  profile: RunnerProfile | null,
  today: string,
): ProfileSection[] {
  if (!profile) return ["personal", "document", "race", "emergency"];
  const complete: Record<ProfileSection, boolean> = {
    personal: Boolean(profile.country && profile.city && profile.birthDate),
    document: Boolean(
      profile.documentType &&
        profile.documentNumber &&
        profile.documentExpiresOn &&
        profile.documentExpiresOn >= today,
    ),
    race: profile.shirtSize !== null,
    emergency: Boolean(profile.emergencyContactName && profile.emergencyContactPhone),
  };
  return (Object.keys(complete) as ProfileSection[]).filter((section) => !complete[section]);
}

// America/Lima, independent of the process TZ.
const profileTimestampFormat = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeZone: CRM_TIME_ZONE,
});

export function formatProfileTimestamp(instant: Date): string {
  return profileTimestampFormat.format(instant);
}
