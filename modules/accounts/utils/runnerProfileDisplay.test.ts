// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { raceDistanceEnum, shirtSizeEnum, travelDocumentTypeEnum } from "@/lib/db-schema";
import type { RunnerProfile } from "../types/runnerProfile.types";
import {
  DOCUMENT_TYPE_LABELS,
  formatProfileTimestamp,
  getMissingProfileSections,
  PROFILE_SECTION_LABELS,
  RACE_DISTANCE_LABELS,
  RUNNER_PROFILE_CONSENT,
  SENSITIVE_DATA_NOTICE,
  SHIRT_SIZE_LABELS,
} from "./runnerProfileDisplay";

const TODAY = "2026-10-25";

const complete: RunnerProfile = {
  email: "ana@example.com",
  fullName: "Ana Pérez",
  phone: "+51938127170",
  country: "Perú",
  city: "Lima",
  birthDate: "1990-04-12",
  documentType: "passport",
  documentNumber: "AB123456",
  documentExpiresOn: "2030-01-31",
  shirtSize: "m",
  preferredDistance: "42k",
  personalBest: "42K en 3:45:10",
  club: "Lima Runners",
  emergencyContactName: "Luis Pérez",
  emergencyContactPhone: "+51999888777",
  medicalNotes: "Ninguna",
  consentVersion: RUNNER_PROFILE_CONSENT.version,
  consentedAt: new Date("2026-10-25T15:00:00Z"),
  updatedAt: new Date("2026-10-25T15:00:00Z"),
};

const missing = (overrides: Partial<RunnerProfile>) =>
  getMissingProfileSections({ ...complete, ...overrides }, TODAY);

describe("labels", () => {
  it.each([
    ["document types", DOCUMENT_TYPE_LABELS, travelDocumentTypeEnum.enumValues],
    ["shirt sizes", SHIRT_SIZE_LABELS, shirtSizeEnum.enumValues],
    ["race distances", RACE_DISTANCE_LABELS, raceDistanceEnum.enumValues],
  ] as const)("has a label for every value of %s", (_name, labels, values) => {
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
    for (const value of values) {
      expect((labels as Record<string, string>)[value]).toMatch(/\S/);
    }
  });

  it("uses the Spanish labels", () => {
    expect(DOCUMENT_TYPE_LABELS).toEqual({
      passport: "Pasaporte",
      national_id: "DNI o documento nacional",
      foreign_id: "Carné de extranjería",
    });
    expect(RACE_DISTANCE_LABELS.ultra).toBe("Ultra");
    expect(SHIRT_SIZE_LABELS.xxl).toBe("XXL");
    expect(PROFILE_SECTION_LABELS).toEqual({
      personal: "Datos personales",
      document: "Documento de viaje",
      race: "Datos de carrera",
      emergency: "Contacto de emergencia",
    });
  });
});

describe("RUNNER_PROFILE_CONSENT", () => {
  it("has a version that fits the consent_version column", () => {
    expect(RUNNER_PROFILE_CONSENT.version.length).toBeGreaterThan(0);
    expect(RUNNER_PROFILE_CONSENT.version.length).toBeLessThanOrEqual(40);
  });

  it("shows the approved texts", () => {
    expect(RUNNER_PROFILE_CONSENT.text).toBe(
      "Acepto que Carreras Viajeras guarde estos datos, incluidos mi documento y mi información médica, para organizar mis viajes. Solo los ve el equipo de Carreras Viajeras.",
    );
    expect(SENSITIVE_DATA_NOTICE).toBe(
      "Dato sensible: solo lo ve el equipo de Carreras Viajeras para gestionar tu viaje.",
    );
  });
});

describe("getMissingProfileSections", () => {
  it("lists the four sections, in order, when there is no profile", () => {
    expect(getMissingProfileSections(null, TODAY)).toEqual(["personal", "document", "race", "emergency"]);
  });

  it("returns nothing for a complete profile", () => {
    expect(getMissingProfileSections(complete, TODAY)).toEqual([]);
  });

  it("lists every section of a minimal profile", () => {
    expect(
      missing({
        country: null,
        city: null,
        birthDate: null,
        documentType: null,
        documentNumber: null,
        documentExpiresOn: null,
        shirtSize: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
      }),
    ).toEqual(["personal", "document", "race", "emergency"]);
  });

  it.each<[Partial<RunnerProfile>, string]>([
    [{ birthDate: null }, "personal"],
    [{ country: null }, "personal"],
    [{ city: null }, "personal"],
    [{ documentExpiresOn: null }, "document"],
    [{ documentType: null, documentNumber: null, documentExpiresOn: null }, "document"],
    [{ documentExpiresOn: "2026-10-24" }, "document"],
    [{ shirtSize: null }, "race"],
    [{ emergencyContactName: null, emergencyContactPhone: null }, "emergency"],
  ])("with %o lists only %s", (overrides, section) => {
    expect(missing(overrides)).toEqual([section]);
  });

  it("treats a document expiring today as valid", () => {
    expect(missing({ documentExpiresOn: TODAY })).toEqual([]);
  });

  it("ignores the optional fields", () => {
    expect(
      missing({ preferredDistance: null, personalBest: null, club: null, medicalNotes: null }),
    ).toEqual([]);
  });
});

describe("formatProfileTimestamp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("formats the day in Lima, across the UTC day change", () => {
    expect(formatProfileTimestamp(new Date("2026-10-25T03:00:00Z"))).toBe("24 oct. 2026");
    expect(formatProfileTimestamp(new Date("2026-10-25T15:00:00Z"))).toBe("25 oct. 2026");
  });

  it.each(["Asia/Tokyo", "UTC", "America/Los_Angeles"])("does not depend on the process TZ (%s)", (timeZone) => {
    vi.stubEnv("TZ", timeZone);
    expect(formatProfileTimestamp(new Date("2026-10-25T03:00:00Z"))).toBe("24 oct. 2026");
  });
});
