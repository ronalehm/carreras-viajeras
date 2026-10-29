// @vitest-environment node
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireVerifiedEmail: vi.fn() }));
vi.mock("../services/runnerProfile.service", () => ({ saveRunnerProfile: vi.fn() }));

import { revalidatePath } from "next/cache";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requireVerifiedEmail, type CurrentUser } from "@/lib/auth/guards";
import { saveRunnerProfile } from "../services/runnerProfile.service";
import type { RunnerProfileActionState } from "../types/runnerProfile.types";
import { saveRunnerProfileAction } from "./runnerProfile.actions";

const guard = vi.mocked(requireVerifiedEmail);
const save = vi.mocked(saveRunnerProfile);
const revalidate = vi.mocked(revalidatePath);

const IDLE: RunnerProfileActionState = { status: "idle" };
const SAVE_FAILED = "No pudimos guardar tu perfil. Inténtalo de nuevo en unos minutos.";

const RUNNER: CurrentUser = {
  id: "runner-1",
  email: "ana@correo.com",
  emailVerified: true,
  staffRoles: [],
};

const MINIMAL = { fullName: "Ana Pérez", phone: "+51 938 127 170", consent: "on" };

// Sensitive values that must never reach the returned state or the logs.
const SENSITIVE = {
  documentType: "passport",
  documentNumber: "AB123456",
  documentExpiresOn: "2030-05-16",
  birthDate: "1990-04-12",
  emergencyContactName: "Luis Pérez",
  emergencyContactPhone: "+51 999 888 777",
  medicalNotes: "Alergia a la penicilina",
};
const SENSITIVE_STRINGS = ["AB123456", "1990-04-12", "Luis Pérez", "+51999888777", "penicilina"];

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.append(key, value);
  return formData;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
  guard.mockResolvedValue(RUNNER);
  save.mockResolvedValue(undefined);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  consoleError.mockRestore();
});

describe("saveRunnerProfileAction called directly", () => {
  it("returns unauthorized without a session and does not call the service", async () => {
    guard.mockRejectedValue(new UnauthorizedError());

    await expect(saveRunnerProfileAction(IDLE, form(MINIMAL))).resolves.toEqual({
      status: "error",
      code: "unauthorized",
      message: "Tu sesión no es válida. Vuelve a iniciar sesión.",
    });
    expect(save).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("returns forbidden for an unverified email (or a failed account lookup) without calling the service", async () => {
    guard.mockRejectedValue(new ForbiddenError());

    await expect(saveRunnerProfileAction(IDLE, form(MINIMAL))).resolves.toEqual({
      status: "error",
      code: "forbidden",
      message: "Verifica tu correo para guardar tu perfil.",
    });
    expect(save).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("rethrows unexpected guard errors", async () => {
    const error = new Error("unexpected");
    guard.mockRejectedValue(error);

    await expect(saveRunnerProfileAction(IDLE, form(MINIMAL))).rejects.toBe(error);
    expect(save).not.toHaveBeenCalled();
  });

  it("returns invalid_input with the first message per field and without values", async () => {
    const state = await saveRunnerProfileAction(
      IDLE,
      form({
        fullName: "Ana Pérez",
        phone: "938127170",
        documentNumber: "AB123456",
        documentExpiresOn: "2026-10-24",
        emergencyContactName: "Luis Pérez",
        medicalNotes: "Alergia a la penicilina",
      }),
    );

    expect(state).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: {
        phone: ["Escribe el número con código de país, p. ej. +51 938 127 170."],
        documentExpiresOn: ["La fecha de vencimiento ya pasó."],
        consent: ["Para guardar tu perfil, acepta el uso de tus datos."],
      },
    });
    expect(state).not.toHaveProperty("values");
    for (const value of ["938127170", ...SENSITIVE_STRINGS]) {
      expect(JSON.stringify(state)).not.toContain(value);
    }
    expect(save).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("reports group errors on the missing field", async () => {
    const state = await saveRunnerProfileAction(
      IDLE,
      form({ ...MINIMAL, documentNumber: "AB123456", emergencyContactName: "Luis Pérez" }),
    );

    expect(state).toMatchObject({
      code: "invalid_input",
      fieldErrors: {
        documentType: ["Elige el tipo de documento."],
        emergencyContactPhone: ["Indica el teléfono del contacto de emergencia."],
      },
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("validates dates against the current UTC day", async () => {
    const state = await saveRunnerProfileAction(
      IDLE,
      form({ ...MINIMAL, documentType: "passport", documentNumber: "AB123456", documentExpiresOn: "2026-10-25" }),
    );

    expect(state).toEqual({ status: "success", message: "Perfil guardado." });
    expect(save.mock.calls[0][2].documentExpiresOn).toBe("2026-10-25");
  });

  it("ignores extra fields and saves with the session's id and email, without consent", async () => {
    const state = await saveRunnerProfileAction(
      IDLE,
      form({
        ...MINIMAL,
        userId: "victim-2",
        email: "victim@correo.com",
        consentVersion: "forged",
        consentedAt: "2000-01-01",
        createdAt: "2000-01-01",
      }),
    );

    expect(state).toEqual({ status: "success", message: "Perfil guardado." });
    expect(save).toHaveBeenCalledExactlyOnceWith("runner-1", "ana@correo.com", {
      fullName: "Ana Pérez",
      phone: "+51938127170",
      country: null,
      city: null,
      birthDate: null,
      documentType: null,
      documentNumber: null,
      documentExpiresOn: null,
      shirtSize: null,
      preferredDistance: null,
      personalBest: null,
      club: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      medicalNotes: null,
    });
  });

  it("returns Perfil guardado. and revalidates /cuenta/perfil on success", async () => {
    const state = await saveRunnerProfileAction(IDLE, form({ ...MINIMAL, ...SENSITIVE }));

    expect(state).toEqual({ status: "success", message: "Perfil guardado." });
    expect(save).toHaveBeenCalledTimes(1);
    expect(revalidate).toHaveBeenCalledExactlyOnceWith("/cuenta/perfil");
    for (const value of SENSITIVE_STRINGS) expect(JSON.stringify(state)).not.toContain(value);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("returns save_failed and logs only the fixed text when the service fails with form data", async () => {
    // As Drizzle wraps a Postgres failure: query, params and cause all carry the row values.
    const cause = new Error(
      'new row for relation "runner_profiles" violates check constraint "runner_profiles_document_chk": ' +
        "Failing row contains (runner-1, ana@correo.com, AB123456, 1990-04-12, Luis Pérez, Alergia a la penicilina)",
    );
    save.mockRejectedValue(
      new DrizzleQueryError(
        'insert into "runner_profiles" ("user_id", "document_number", "medical_notes") values ($1, $2, $3)',
        ["runner-1", "AB123456", "1990-04-12", "Luis Pérez", "+51999888777", "Alergia a la penicilina"],
        cause,
      ),
    );

    const state = await saveRunnerProfileAction(IDLE, form({ ...MINIMAL, ...SENSITIVE }));

    expect(state).toEqual({ status: "error", code: "save_failed", message: SAVE_FAILED });
    expect(consoleError).toHaveBeenCalledExactlyOnceWith("runner-profile: save failed");
    expect(revalidate).not.toHaveBeenCalled();

    const exposed = JSON.stringify([state, consoleError.mock.calls]);
    for (const value of [...SENSITIVE_STRINGS, "Failing row", "runner_profiles_document_chk", "insert into"]) {
      expect(exposed).not.toContain(value);
    }
  });
});
