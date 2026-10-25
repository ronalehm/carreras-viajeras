import type { z } from "zod";
import type { raceDistanceEnum, shirtSizeEnum, travelDocumentTypeEnum } from "@/lib/db-schema";
import type { runnerProfileFormSchema } from "../schemas/runnerProfile.schema";

export type TravelDocumentType = (typeof travelDocumentTypeEnum.enumValues)[number];
export type ShirtSize = (typeof shirtSizeEnum.enumValues)[number];
export type RaceDistance = (typeof raceDistanceEnum.enumValues)[number];

// What the service saves: the form without the consent box (its version is a server constant).
export type RunnerProfileInput = Omit<z.output<ReturnType<typeof runnerProfileFormSchema>>, "consent">;

// Calendar dates are YYYY-MM-DD. document_*, medicalNotes (and birthDate and the emergency
// contact) are sensitive: never in logs or errors.
export type RunnerProfile = {
  email: string;
  fullName: string;
  phone: string;
  country: string | null;
  city: string | null;
  birthDate: string | null;
  documentType: TravelDocumentType | null;
  documentNumber: string | null;
  documentExpiresOn: string | null;
  shirtSize: ShirtSize | null;
  preferredDistance: RaceDistance | null;
  personalBest: string | null;
  club: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  medicalNotes: string | null;
  consentVersion: string;
  consentedAt: Date;
  updatedAt: Date;
};

export type ProfileSection = "personal" | "document" | "race" | "emergency";
