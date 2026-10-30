// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { auth, currentUser, roles, revalidate, createVersion } = vi.hoisted(() => ({
  auth: vi.fn(), currentUser: vi.fn(), roles: vi.fn(), revalidate: vi.fn(), createVersion: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));
vi.mock("@/lib/auth/access.service", () => ({ acceptInvitationAndLoadStaffRoles: roles, loadStaffRoles: roles }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("../services/welcomeDiscount.service", () => ({ createWelcomeDiscountVersion: createVersion }));
import type { StaffRole } from "@/lib/auth/permissions";
import type { RewardActionState } from "../types/rewards.types";
import { saveWelcomeDiscountAction } from "./welcomeDiscount.actions";

const ID = "47d8ef9d-227f-4557-bc52-d844e82b22e1";
const IDLE: RewardActionState = { status: "idle" };
const VALID = { amountUsd: "50", validityDays: "60", active: "on" };
function form(fields: Record<string, string>) {
  const data = new FormData();
  Object.entries(fields).forEach(([key, value]) => data.append(key, value));
  return data;
}
function session(staffRoles: StaffRole[] = [], verified = true) {
  auth.mockResolvedValue({ userId: "trusted-clerk-user" });
  roles.mockResolvedValue({ staffRoles, blocked: false });
  currentUser.mockResolvedValue({ id: "trusted-clerk-user", primaryEmailAddressId: "primary", emailAddresses: [{ id: "primary", emailAddress: "admin@example.com", verification: { status: verified ? "verified" : "unverified" } }] });
}
beforeEach(() => {
  vi.resetAllMocks();
  createVersion.mockResolvedValue({ status: "success", code: "created", id: ID });
  session(["admin"]);
});

describe("saveWelcomeDiscountAction", () => {
  it("rejects a signed-out request before validating or saving", async () => {
    auth.mockResolvedValue({ userId: null });
    expect(await saveWelcomeDiscountAction(IDLE, new FormData())).toMatchObject({ status: "error", code: "unauthorized" });
    expect(createVersion).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it.each(["commercial", "organizer", "sponsor"] as const)("denies %s without rewards.manage", async (role) => {
    session([role]);
    expect(await saveWelcomeDiscountAction(IDLE, form(VALID))).toMatchObject({ status: "error", code: "forbidden" });
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("denies an admin with an unverified primary email", async () => {
    session(["admin"], false);
    expect(await saveWelcomeDiscountAction(IDLE, form(VALID))).toMatchObject({ status: "error", code: "forbidden" });
    expect(createVersion).not.toHaveBeenCalled();
  });

  it.each(["admin", "super_admin"] as const)("allows %s to save", async (role) => {
    session([role]);
    expect(await saveWelcomeDiscountAction(IDLE, form(VALID))).toMatchObject({ status: "success" });
    expect(createVersion).toHaveBeenCalledOnce();
  });

  it("validates ranges and integers with field messages and no mutation", async () => {
    const result = await saveWelcomeDiscountAction(IDLE, form({ amountUsd: "10001", validityDays: "1.5" }));
    expect(result).toMatchObject({ status: "error", code: "invalid_input", fieldErrors: { amountUsd: [expect.any(String)], validityDays: [expect.any(String)] } });
    expect(await saveWelcomeDiscountAction(IDLE, form({ amountUsd: "0", validityDays: "366" }))).toMatchObject({ status: "error", code: "invalid_input" });
    expect(createVersion).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("saves with the session actor only, ignoring spoofed fields, and refreshes the admin page", async () => {
    const result = await saveWelcomeDiscountAction(IDLE, form({ ...VALID, actorId: "spoofed", createdBy: "victim", userId: "victim" }));
    expect(result).toMatchObject({ status: "success", message: expect.stringContaining("guardado") });
    expect(createVersion).toHaveBeenCalledWith("trusted-clerk-user", { amountUsd: 50, validityDays: 60, active: true });
    expect(JSON.stringify(createVersion.mock.calls)).not.toMatch(/spoofed|victim/);
    expect(revalidate).toHaveBeenCalledWith("/crm/recompensas");
  });

  it("creates an inactive version when the checkbox is unchecked", async () => {
    const result = await saveWelcomeDiscountAction(IDLE, form({ amountUsd: "50", validityDays: "60" }));
    expect(result).toMatchObject({ status: "success", message: expect.stringContaining("desactivado") });
    expect(createVersion).toHaveBeenCalledWith("trusted-clerk-user", { amountUsd: 50, validityDays: 60, active: false });
  });

  it("returns a fixed error without leaking service causes or refreshing", async () => {
    createVersion.mockRejectedValue(new Error("DATABASE_URL password admin@example.com"));
    const result = await saveWelcomeDiscountAction(IDLE, form(VALID));
    expect(result).toMatchObject({ status: "error", code: "unavailable" });
    expect(JSON.stringify(result)).not.toMatch(/DATABASE_URL|password|admin@/);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("treats a function-level error as unavailable", async () => {
    createVersion.mockResolvedValue({ status: "error", code: "anything" });
    expect(await saveWelcomeDiscountAction(IDLE, form(VALID))).toMatchObject({ status: "error", code: "unavailable" });
    expect(revalidate).not.toHaveBeenCalled();
  });
});
