// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("../services/demoParticipants.service", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/demoParticipants.service")>(),
  grantDemoParticipant: vi.fn(), revokeDemoParticipant: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { grantDemoParticipant, revokeDemoParticipant } from "../services/demoParticipants.service";
import { grantDemoParticipantAction, revokeDemoParticipantAction } from "./demoParticipants.actions";

const idle = { status: "idle" } as const;
function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requirePermission).mockResolvedValue({ id: "trusted-admin", email: "admin@example.test", emailVerified: true, staffRoles: ["admin"] });
  vi.mocked(grantDemoParticipant).mockResolvedValue("granted");
  vi.mocked(revokeDemoParticipant).mockResolvedValue("revoked");
});

describe("demo participant server actions", () => {
  it.each([new UnauthorizedError(), new ForbiddenError()])("recheck offers.manage on every call (%s)", async (error) => {
    vi.mocked(requirePermission).mockRejectedValue(error);
    expect(await grantDemoParticipantAction(idle, form({ email: "demo@example.test" }))).toMatchObject({ status: "error" });
    expect(await revokeDemoParticipantAction(idle, form({ userId: "user_demo" }))).toMatchObject({ status: "error" });
    expect(requirePermission).toHaveBeenCalledWith("offers.manage");
    expect(grantDemoParticipant).not.toHaveBeenCalled();
    expect(revokeDemoParticipant).not.toHaveBeenCalled();
  });
  it("grants by email with the session actor, ignoring forged audit fields", async () => {
    const result = await grantDemoParticipantAction(idle, form({
      email: " Demo@Example.TEST ", note: "Jurado", grantedBy: "intruder", userId: "user_forged", revokedAt: "",
    }));
    expect(result).toEqual({ status: "success", message: "Participante dado de alta." });
    expect(grantDemoParticipant).toHaveBeenCalledWith({ email: "demo@example.test", note: "Jurado" }, "trusted-admin");
    expect(revalidatePath).toHaveBeenCalledWith("/crm/contratos");
    expect(revalidatePath).toHaveBeenCalledWith("/crm/admin/usuarios");
  });
  it("asks for a first sign-in when no account has that verified email", async () => {
    vi.mocked(grantDemoParticipant).mockResolvedValue("account_not_found");
    const result = await grantDemoParticipantAction(idle, form({ email: "nadie@example.test" }));
    expect(result.status).toBe("error");
    expect(result.status === "error" && result.message).toContain("La persona debe iniciar sesión una vez en el sitio");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it.each(["already_active", "ambiguous_account"] as const)("reports %s without revalidating", async (outcome) => {
    vi.mocked(grantDemoParticipant).mockResolvedValue(outcome);
    expect(await grantDemoParticipantAction(idle, form({ email: "demo@example.test" }))).toMatchObject({ status: "error" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("confirms a re-grant of a revoked participant", async () => {
    vi.mocked(grantDemoParticipant).mockResolvedValue("restored");
    expect(await grantDemoParticipantAction(idle, form({ email: "demo@example.test", note: "" }))).toEqual({ status: "success", message: "Participante dado de alta de nuevo." });
    expect(grantDemoParticipant).toHaveBeenCalledWith({ email: "demo@example.test", note: null }, "trusted-admin");
  });
  it("validates the email before any write", async () => {
    expect(await grantDemoParticipantAction(idle, form({ email: "no-es-correo" }))).toEqual({ status: "error", message: "Escribe un correo válido." });
    expect(await grantDemoParticipantAction(idle, form({}))).toMatchObject({ status: "error" });
    expect(grantDemoParticipant).not.toHaveBeenCalled();
  });
  it("revokes by user id and reports a participant already revoked", async () => {
    expect(await revokeDemoParticipantAction(idle, form({ userId: "user_demo" }))).toEqual({ status: "success", message: "Participante dado de baja." });
    expect(revokeDemoParticipant).toHaveBeenCalledWith({ userId: "user_demo" });
    expect(revalidatePath).toHaveBeenCalledWith("/crm/contratos");
    expect(revalidatePath).toHaveBeenCalledWith("/crm/admin/usuarios");
    vi.mocked(revalidatePath).mockClear();
    vi.mocked(revokeDemoParticipant).mockResolvedValue("not_active");
    expect(await revokeDemoParticipantAction(idle, form({ userId: "user_demo" }))).toMatchObject({ status: "error" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("rejects a revoke without a user id before any write", async () => {
    expect(await revokeDemoParticipantAction(idle, form({}))).toMatchObject({ status: "error" });
    expect(revokeDemoParticipant).not.toHaveBeenCalled();
  });
  it("does not expose database errors", async () => {
    vi.mocked(grantDemoParticipant).mockRejectedValue(new Error("private database connection details"));
    vi.mocked(revokeDemoParticipant).mockRejectedValue(new Error("private database connection details"));
    const results = [
      await grantDemoParticipantAction(idle, form({ email: "demo@example.test" })),
      await revokeDemoParticipantAction(idle, form({ userId: "user_demo" })),
    ];
    for (const result of results) {
      expect(result.status).toBe("error");
      expect(JSON.stringify(result)).not.toContain("private database");
    }
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
