// @vitest-environment node
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getCurrentUser: vi.fn() }));
vi.mock("../services/runnerProfile.service", () => ({ getRunnerProfile: vi.fn() }));

import { connection } from "next/server";
import { ForbiddenError } from "@/lib/auth/errors";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/guards";
import { getRunnerProfile } from "../services/runnerProfile.service";
import type { RunnerProfile } from "../types/runnerProfile.types";
import { getRunnerProfilePage } from "./runnerProfilePage";

const connectionMock = vi.mocked(connection);
const currentUser = vi.mocked(getCurrentUser);
const loadProfile = vi.mocked(getRunnerProfile);

const RUNNER: CurrentUser = {
  id: "runner-1",
  email: "ana@correo.com",
  emailVerified: true,
  staffRoles: [],
};

const PROFILE: RunnerProfile = {
  email: "ana@correo.com",
  fullName: "Ana Pérez",
  phone: "+51938127170",
  country: "Perú",
  city: "Lima",
  birthDate: "1990-04-12",
  documentType: "passport",
  documentNumber: "AB123456",
  documentExpiresOn: "2030-05-16",
  shirtSize: "m",
  preferredDistance: "42k",
  personalBest: "42K en 3:45:10",
  club: null,
  emergencyContactName: "Luis Pérez",
  emergencyContactPhone: "+51999888777",
  medicalNotes: "Alergia a la penicilina",
  consentVersion: "runner-profile-2026-10",
  consentedAt: new Date("2026-10-20T15:00:00Z"),
  updatedAt: new Date("2026-10-20T15:00:00Z"),
};

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
  currentUser.mockResolvedValue(RUNNER);
  loadProfile.mockResolvedValue(PROFILE);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  consoleError.mockRestore();
});

describe("getRunnerProfilePage", () => {
  it("awaits connection() before reading the session", async () => {
    await getRunnerProfilePage();

    expect(connectionMock).toHaveBeenCalledTimes(1);
    expect(connectionMock.mock.invocationCallOrder[0]).toBeLessThan(currentUser.mock.invocationCallOrder[0]);
  });

  it("returns unauthenticated without a session and does not read the profile", async () => {
    currentUser.mockResolvedValue(null);

    await expect(getRunnerProfilePage()).resolves.toEqual({ status: "unauthenticated" });
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("returns unverified with the email for an unverified account, without reading the profile", async () => {
    currentUser.mockResolvedValue({ ...RUNNER, emailVerified: false });

    await expect(getRunnerProfilePage()).resolves.toEqual({ status: "unverified", email: "ana@correo.com" });
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("maps a ForbiddenError from getCurrentUser (Neon Auth or role lookup) to error", async () => {
    currentUser.mockRejectedValue(new ForbiddenError());

    await expect(getRunnerProfilePage()).resolves.toEqual({ status: "error" });
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("rethrows any other error from getCurrentUser", async () => {
    const error = new Error("unexpected");
    currentUser.mockRejectedValue(error);

    await expect(getRunnerProfilePage()).rejects.toBe(error);
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("returns ok with the session email, the UTC day and the own profile", async () => {
    await expect(getRunnerProfilePage()).resolves.toEqual({
      status: "ok",
      email: "ana@correo.com",
      today: "2026-10-25",
      profile: PROFILE,
    });
    expect(loadProfile).toHaveBeenCalledExactlyOnceWith("runner-1");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("uses the UTC day, not the local one", async () => {
    // 20:30 in Lima on 2026-10-24 is already 2026-10-25 in UTC (Decision 15).
    vi.setSystemTime(new Date("2026-10-25T01:30:00Z"));

    await expect(getRunnerProfilePage()).resolves.toMatchObject({ today: "2026-10-25" });
  });

  it("returns ok with a null profile when the runner has none yet", async () => {
    loadProfile.mockResolvedValue(null);

    await expect(getRunnerProfilePage()).resolves.toEqual({
      status: "ok",
      email: "ana@correo.com",
      today: "2026-10-25",
      profile: null,
    });
  });

  it("returns error and logs only the fixed text when the profile read fails", async () => {
    // As Drizzle wraps a Postgres failure: the query, its params and the cause carry data.
    loadProfile.mockRejectedValue(
      new DrizzleQueryError(
        'select "document_number", "medical_notes" from "runner_profiles" where "user_id" = $1',
        ["runner-1", "ana@correo.com"],
        new Error("connection to ep-secret-host.neon.tech failed for runner-1 (ana@correo.com)"),
      ),
    );

    const state = await getRunnerProfilePage();

    expect(state).toEqual({ status: "error" });
    expect(consoleError).toHaveBeenCalledExactlyOnceWith("runner-profile: load failed");
    const exposed = JSON.stringify([state, consoleError.mock.calls]);
    for (const value of ["runner-1", "ana@correo.com", "ep-secret-host", "select", "runner_profiles"]) {
      expect(exposed).not.toContain(value);
    }
  });
});
