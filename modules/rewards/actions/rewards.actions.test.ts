// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { auth, currentUser, roles, revalidate, services } = vi.hoisted(() => ({
  auth: vi.fn(), currentUser: vi.fn(), roles: vi.fn(), revalidate: vi.fn(),
  services: Object.fromEntries(["claimReferral", "requestRedemption", "cancelOwnRedemption", "createRewardRule", "createCatalogVersion", "deactivateRewardRule", "deactivateCatalogVersion", "applyRewardToBooking", "assignBookingBenefit", "fulfillReward"].map((name) => [name, vi.fn()])),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));
vi.mock("@/lib/auth/access.service", () => ({ acceptInvitationAndLoadStaffRoles: roles, loadStaffRoles: roles }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("../services/rewards.service", () => services);
import type { StaffRole } from "@/lib/auth/permissions";
import type { RewardActionState } from "../types/rewards.types";
import { applyRewardAction, assignBookingBenefitAction, cancelRedemptionAction, claimReferralAction, createCatalogVersionAction, createRewardRuleAction, deactivateCatalogVersionAction, deactivateRewardRuleAction, fulfillRewardAction, requestRedemptionAction } from "./rewards.actions";

const ID = "47d8ef9d-227f-4557-bc52-d844e82b22e1";
const KEY = "d979b3be-0967-46c8-a8fe-a8d24c3f2933";
const IDLE: RewardActionState = { status: "idle" };
const CODE = "a_valid_opaque_referral_code_12345";
function form(fields: Record<string, string>) { const data = new FormData(); Object.entries(fields).forEach(([key, value]) => data.append(key, value)); return data; }
function session(staffRoles: StaffRole[] = [], verified = true) {
  auth.mockResolvedValue({ userId: "trusted-clerk-user" }); roles.mockResolvedValue(staffRoles);
  currentUser.mockResolvedValue({ id: "trusted-clerk-user", primaryEmailAddressId: "primary", emailAddresses: [{ id: "primary", emailAddress: "runner@example.com", verification: { status: verified ? "verified" : "unverified" } }] });
}
beforeEach(() => { vi.resetAllMocks(); Object.values(services).forEach((service) => service.mockResolvedValue({ status: "success", code: "created", id: ID })); session(["admin"]); });

const RULE = { pointsPerReferral: "15", maxReferralsPerRunner: "", validFrom: "2026-10-29", validUntil: "", terms: "Condiciones expresas de atribución y elegibilidad." };
const CATALOG = { title: "Descuento de viaje", description: "Descuento aplicable a una reserva pendiente sin pagos.", kind: "discount", costStars: "80", discountUsd: "20", maxPerRunner: "1", redemptionDays: "30", validFrom: "2026-10-29", active: "on" };
const CASES: { name: string; action: (prev: RewardActionState, data: FormData) => Promise<RewardActionState>; service: string; fields: Record<string, string>; own?: boolean; apply?: boolean }[] = [
  { name: "claim", action: claimReferralAction, service: "claimReferral", own: true, fields: { code: CODE, consent: "on", ruleVersionId: ID } },
  { name: "request", action: requestRedemptionAction, service: "requestRedemption", own: true, fields: { catalogVersionId: ID, requestKey: KEY } },
  { name: "cancel", action: cancelRedemptionAction, service: "cancelOwnRedemption", own: true, fields: { id: ID } },
  { name: "createRule", action: createRewardRuleAction, service: "createRewardRule", fields: RULE },
  { name: "createCatalog", action: createCatalogVersionAction, service: "createCatalogVersion", fields: CATALOG },
  { name: "deactivateRule", action: deactivateRewardRuleAction, service: "deactivateRewardRule", fields: { id: ID } },
  { name: "deactivateCatalog", action: deactivateCatalogVersionAction, service: "deactivateCatalogVersion", fields: { id: ID } },
  { name: "apply", action: applyRewardAction, service: "applyRewardToBooking", apply: true, fields: { redemptionId: ID, bookingId: KEY } },
  { name: "assignBenefit", action: assignBookingBenefitAction, service: "assignBookingBenefit", fields: { bookingId: KEY, title: "Traslado contratado", description: "Incluido en la confirmación original de la reserva." } },
  { name: "fulfill", action: fulfillRewardAction, service: "fulfillReward", apply: true, fields: { id: ID } },
];

describe.each(CASES)("$name direct action", (entry) => {
  it("authorizes before validating and never reaches the service when signed out", async () => {
    auth.mockResolvedValue({ userId: null });
    expect(await entry.action(IDLE, new FormData())).toMatchObject({ status: "error", code: "unauthorized" });
    expect(services[entry.service]).not.toHaveBeenCalled(); expect(revalidate).not.toHaveBeenCalled();
  });
  it("rejects even an admin with an unverified primary email", async () => {
    session(["admin"], false);
    expect(await entry.action(IDLE, form(entry.fields))).toMatchObject({ status: "error", code: "forbidden" });
    expect(services[entry.service]).not.toHaveBeenCalled();
  });
  it("validates malformed input without a mutation", async () => {
    expect(await entry.action(IDLE, new FormData())).toMatchObject({ status: "error", code: "invalid_input" });
    expect(services[entry.service]).not.toHaveBeenCalled();
  });
  it("uses only the session actor and refreshes affected pages on success", async () => {
    const fields = { ...entry.fields, actorId: "spoofed", userId: "victim", balance: "99999", staffRoles: "super_admin" };
    expect(await entry.action(IDLE, form(fields))).toMatchObject({ status: "success" });
    expect(services[entry.service].mock.calls[0][0]).toBe("trusted-clerk-user");
    expect(JSON.stringify(services[entry.service].mock.calls)).not.toContain("spoofed");
    expect(JSON.stringify(services[entry.service].mock.calls)).not.toContain("victim");
    expect(revalidate).toHaveBeenCalledWith("/cuenta/perfil");
    expect(revalidate).toHaveBeenCalledWith("/crm/(protected)/reservas/[id]", "page");
  });
  it("returns a fixed error without leaking service causes", async () => {
    services[entry.service].mockRejectedValue(new Error("DATABASE_URL password private-runner@example.com"));
    const result = await entry.action(IDLE, form(entry.fields));
    expect(result).toMatchObject({ status: "error", code: "unavailable" });
    expect(JSON.stringify(result)).not.toMatch(/DATABASE_URL|password|private-runner/); expect(revalidate).not.toHaveBeenCalled();
  });
});

it("allows verified runners to manage their own referral and reuses the exact redemption key", async () => {
  session();
  await claimReferralAction(IDLE, form({ code: CODE, consent: "on", ruleVersionId: ID }));
  expect(services.claimReferral).toHaveBeenCalledWith("trusted-clerk-user", CODE, true, ID);
  await requestRedemptionAction(IDLE, form({ catalogVersionId: ID, requestKey: KEY }));
  await requestRedemptionAction(IDLE, form({ catalogVersionId: ID, requestKey: KEY }));
  expect(services.requestRedemption).toHaveBeenNthCalledWith(1, "trusted-clerk-user", ID, KEY);
  expect(services.requestRedemption).toHaveBeenNthCalledWith(2, "trusted-clerk-user", ID, KEY);
});
it.each(["commercial", "organizer", "sponsor"] as const)("denies program management to %s", async (role) => {
  session([role]);
  for (const entry of CASES.filter((item) => !item.own && !item.apply)) {
    expect(await entry.action(IDLE, form(entry.fields))).toMatchObject({ status: "error", code: "forbidden" });
    expect(services[entry.service]).not.toHaveBeenCalled();
  }
});
it("permits commercial reward application but not contractual benefits", async () => {
  session(["commercial"]);
  expect(await applyRewardAction(IDLE, form({ redemptionId: ID, bookingId: KEY }))).toMatchObject({ status: "success" });
  expect(await fulfillRewardAction(IDLE, form({ id: ID }))).toMatchObject({ status: "success" });
  expect(await assignBookingBenefitAction(IDLE, form({ bookingId: KEY, title: "Traslado", description: "Evidencia de lo contratado." }))).toMatchObject({ status: "error", code: "forbidden" });
});
it.each(["organizer", "sponsor"] as const)("denies reward application to %s", async (role) => {
  session([role]);
  expect(await applyRewardAction(IDLE, form({ redemptionId: ID, bookingId: KEY }))).toMatchObject({ status: "error", code: "forbidden" });
});
it("requires explicit referral consent and does not infer marketing consent", async () => {
  session();
  expect(await claimReferralAction(IDLE, form({ code: CODE, termsAccepted: "true" }))).toMatchObject({ status: "error", fieldErrors: { consent: expect.any(Array) } });
  expect(services.claimReferral).not.toHaveBeenCalled();
});
it("requires the displayed rule version and returns a fixed rejection if it changed", async () => {
  session();
  expect(await claimReferralAction(IDLE, form({ code: CODE, consent: "on" }))).toMatchObject({ status: "error", code: "invalid_input" });
  expect(services.claimReferral).not.toHaveBeenCalled();
  services.claimReferral.mockResolvedValue({ status: "error", code: "program_unavailable" });
  expect(await claimReferralAction(IDLE, form({ code: CODE, consent: "on", ruleVersionId: ID }))).toMatchObject({ status: "error", code: "program_unavailable" });
  expect(services.claimReferral).toHaveBeenCalledWith("trusted-clerk-user", CODE, true, ID);
  expect(revalidate).not.toHaveBeenCalled();
});
it("keeps business failures fixed and does not refresh after rejection", async () => {
  services.requestRedemption.mockResolvedValue({ status: "error", code: "insufficient_stars" });
  expect(await requestRedemptionAction(IDLE, form({ catalogVersionId: ID, requestKey: KEY }))).toMatchObject({ status: "error", code: "insufficient_stars" });
  expect(revalidate).not.toHaveBeenCalled();
});
it("drops unknown service error codes instead of exposing arbitrary text", async () => {
  services.requestRedemption.mockResolvedValue({ status: "error", code: "password-secret" });
  expect(await requestRedemptionAction(IDLE, form({ catalogVersionId: ID, requestKey: KEY }))).toMatchObject({ status: "error", code: "unavailable" });
});
it("saves inactive rules only with explicit numeric business input", async () => {
  await createRewardRuleAction(IDLE, form(RULE));
  expect(services.createRewardRule).toHaveBeenCalledWith("trusted-clerk-user", { pointsPerReferral: 15, maxReferralsPerRunner: null, validFrom: "2026-10-29", validUntil: null, terms: RULE.terms, active: false });
});
