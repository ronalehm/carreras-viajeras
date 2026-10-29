// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getCurrentUser: vi.fn() }));
vi.mock("../services/runnerPortal.service", () => ({ loadRunnerPortal: vi.fn() }));

import { connection } from "next/server";
import { ForbiddenError } from "@/lib/auth/errors";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/guards";
import { loadRunnerPortal } from "../services/runnerPortal.service";
import type { RunnerBookingDetail, RunnerBookingSummary } from "../types/bookings.types";
import { getRunnerPortal } from "./runnerPortal";

const connectionMock = vi.mocked(connection);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const loadMock = vi.mocked(loadRunnerPortal);

const BOOKING_ID = "8b0f1c1e-1d2a-4b3c-9d4e-5f6a7b8c9d0e";
const OTHER_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const verified: CurrentUser = {
  id: "user-1",
  email: "ana@example.com",
  emailVerified: true,
  staffRoles: [],
  name: "Ana Pérez",
};

function summary(id: string): RunnerBookingSummary {
  return {
    id,
    status: "confirmed",
    trip: {
      title: "Maratón de Santiago 42K 2027",
      city: "Santiago",
      country: "Chile",
      raceDate: "2027-05-16",
      startDate: null,
      endDate: null,
      includes: [],
    },
  };
}

function detail(id: string): RunnerBookingDetail {
  return {
    ...summary(id),
    packageLabel: "Paquete corredor",
    distance: "42K",
    totalUsd: 1499,
    balanceDueOn: null,
    createdAt: new Date("2027-03-03T15:00:00Z"),
    payments: [],
    items: [],
    updates: [],
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 22:00 on Oct 18 in Lima, already Oct 19 in UTC.
  vi.setSystemTime(new Date("2026-10-19T03:00:00Z"));
  connectionMock.mockReset().mockResolvedValue(undefined);
  getCurrentUserMock.mockReset();
  loadMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getRunnerPortal: access", () => {
  it("awaits connection() before reading the session", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    await getRunnerPortal(undefined);

    expect(connectionMock).toHaveBeenCalledOnce();
    expect(connectionMock.mock.invocationCallOrder[0]).toBeLessThan(
      getCurrentUserMock.mock.invocationCallOrder[0],
    );
  });

  it("returns unauthenticated without a session, also with ?reserva", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    await expect(getRunnerPortal(BOOKING_ID)).resolves.toEqual({ status: "unauthenticated" });
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("returns unverified without loading bookings when the email is not verified", async () => {
    getCurrentUserMock.mockResolvedValue({ ...verified, emailVerified: false });

    await expect(getRunnerPortal(BOOKING_ID)).resolves.toEqual({
      status: "unverified",
      name: "Ana Pérez",
      email: "ana@example.com",
    });
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("maps a ForbiddenError from getCurrentUser (auth or database failure) to error", async () => {
    getCurrentUserMock.mockRejectedValue(new ForbiddenError());

    await expect(getRunnerPortal(undefined)).resolves.toEqual({ status: "error" });
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("rethrows any other error from getCurrentUser", async () => {
    const error = new Error("unexpected");
    getCurrentUserMock.mockRejectedValue(error);

    await expect(getRunnerPortal(undefined)).rejects.toBe(error);
  });
});

describe("getRunnerPortal: data", () => {
  it("loads only with the session's id and verified email, the raw param and Lima's today", async () => {
    getCurrentUserMock.mockResolvedValue(verified);
    loadMock.mockResolvedValue({ bookings: [], selected: null });

    await getRunnerPortal([OTHER_ID]);

    expect(loadMock).toHaveBeenCalledExactlyOnceWith(
      "user-1",
      "ana@example.com",
      [OTHER_ID],
      "2026-10-18",
    );
  });

  it("returns ok with no bookings (empty state)", async () => {
    getCurrentUserMock.mockResolvedValue(verified);
    loadMock.mockResolvedValue({ bookings: [], selected: null });

    await expect(getRunnerPortal(undefined)).resolves.toEqual({
      status: "ok",
      name: "Ana Pérez",
      email: "ana@example.com",
      today: "2026-10-18",
      data: { bookings: [], selected: null },
    });
  });

  it("returns ok with one booking selected", async () => {
    getCurrentUserMock.mockResolvedValue(verified);
    const data = { bookings: [summary(BOOKING_ID)], selected: detail(BOOKING_ID) };
    loadMock.mockResolvedValue(data);

    await expect(getRunnerPortal(undefined)).resolves.toMatchObject({ status: "ok", data });
  });

  it("returns ok with several bookings, keeping the service's order and selection", async () => {
    getCurrentUserMock.mockResolvedValue(verified);
    const data = {
      bookings: [summary(BOOKING_ID), summary(OTHER_ID)],
      selected: detail(OTHER_ID),
    };
    loadMock.mockResolvedValue(data);

    const state = await getRunnerPortal(OTHER_ID);

    expect(state).toMatchObject({ status: "ok", data });
  });

  it("omits name when the session has none", async () => {
    getCurrentUserMock.mockResolvedValue({ ...verified, name: undefined });
    loadMock.mockResolvedValue({ bookings: [], selected: null });

    const state = await getRunnerPortal(undefined);

    expect(state).not.toHaveProperty("name");
  });
});

describe("getRunnerPortal: errors", () => {
  it("returns error and logs only fixed text when loading fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getCurrentUserMock.mockResolvedValue(verified);
    loadMock.mockRejectedValue(new Error("connect ECONNREFUSED ana@example.com secret"));

    const state = await getRunnerPortal(undefined);

    expect(state).toEqual({ status: "error", name: "Ana Pérez" });
    expect(JSON.stringify(state)).not.toContain("ECONNREFUSED");
    expect(consoleError).toHaveBeenCalledExactlyOnceWith("runner-portal: load failed");
  });

  it("returns error when the bookings list has no selected detail (unlinked between batches)", async () => {
    getCurrentUserMock.mockResolvedValue(verified);
    loadMock.mockResolvedValue({ bookings: [summary(BOOKING_ID)], selected: null });

    await expect(getRunnerPortal(undefined)).resolves.toEqual({
      status: "error",
      name: "Ana Pérez",
    });
  });
});
