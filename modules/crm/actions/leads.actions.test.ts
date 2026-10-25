// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));
vi.mock("../services/leads.service", () => ({ createLead: vi.fn() }));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { createLeadSchema } from "../schemas/leads.schema";
import { createLead } from "../services/leads.service";
import { createLeadAction } from "./leads.actions";

const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const IDLE = { status: "idle" } as const;
const ACTOR = { id: "staff-1", email: "agent@example.com", emailVerified: true, staffRoles: ["commercial" as const] };
const VALID = {
  fullName: "Ana Pérez", phone: "+51 938 127 170", email: "", location: "", tripId: "",
  destinationText: "", source: "whatsapp", ownerUserId: "staff-2", note: "", consent: "on",
};
// Keys a client could add to try to set server-owned columns or the actor.
const SMUGGLED = { stage: "paid", createdBy: "user-x", consentVersion: "fake", actorUserId: "user-y" };

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(redirect).mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
  vi.mocked(requirePermission).mockResolvedValue(ACTOR);
  vi.mocked(createLead).mockResolvedValue({ id: LEAD_ID });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("createLeadAction: permisos en llamadas directas", () => {
  it("rechaza sin sesión sin llamar al service", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new UnauthorizedError());
    expect(await createLeadAction(IDLE, form(VALID))).toEqual({
      status: "error", code: "unauthorized", message: "Tu sesión no es válida. Vuelve a iniciar sesión.",
    });
    expect(createLead).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rechaza al runner aunque envíe campos falsificados", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new ForbiddenError());
    expect(await createLeadAction(IDLE, form({ ...VALID, ...SMUGGLED, role: "admin" }))).toEqual({
      status: "error", code: "forbidden", message: "No tienes permiso para gestionar leads.",
    });
    expect(createLead).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("exige leads.manage", async () => {
    await expect(createLeadAction(IDLE, form(VALID))).rejects.toThrow("NEXT_REDIRECT");
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith("leads.manage");
  });

  it("propaga errores inesperados de la guarda", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new Error("boom"));
    await expect(createLeadAction(IDLE, form(VALID))).rejects.toThrow("boom");
    expect(createLead).not.toHaveBeenCalled();
  });
});

describe("createLeadAction: validación", () => {
  it("sin consentimiento y con teléfono sin código de país devuelve invalid_input con lo escrito", async () => {
    const withoutConsent: Record<string, string> = { ...VALID };
    delete withoutConsent.consent;
    const result = await createLeadAction(IDLE, form({ ...withoutConsent, phone: "938 127 170", ...SMUGGLED, secret: "x" }));
    expect(result).toMatchObject({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: {
        phone: ["Escribe el número con código de país, p. ej. +51 938 127 170."],
        consent: ["Confirma que el contacto aceptó que guardemos sus datos."],
      },
      values: { ...withoutConsent, phone: "938 127 170" },
    });
    if (result.status === "error") {
      for (const key of ["consent", ...Object.keys(SMUGGLED), "secret"]) {
        expect(result.values).not.toHaveProperty(key);
      }
    }
    expect(createLead).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("los mensajes de error no repiten lo escrito", async () => {
    const result = await createLeadAction(IDLE, form({ ...VALID, fullName: "Z", email: "zz-private@", tripId: "abc" }));
    expect(result).toMatchObject({ code: "invalid_input" });
    if (result.status === "error") {
      expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(["email", "fullName", "tripId"]);
      const messages = JSON.stringify(result.fieldErrors) + result.message;
      expect(messages).not.toContain("zz-private");
      expect(messages).not.toContain("abc");
    }
    expect(createLead).not.toHaveBeenCalled();
  });

  it("no devuelve archivos en values", async () => {
    const data = form({ ...VALID, fullName: "Z" });
    data.set("note", new File(["note"], "note.txt"));
    const result = await createLeadAction(IDLE, data);
    expect(result).toMatchObject({ code: "invalid_input" });
    if (result.status === "error") expect(result.values).not.toHaveProperty("note");
  });
});

describe("createLeadAction: alta", () => {
  it("crea con los datos parseados y el actor de la sesión, revalida y redirige a la lista", async () => {
    await expect(createLeadAction(IDLE, form({ ...VALID, ...SMUGGLED }))).rejects.toThrow("NEXT_REDIRECT");
    expect(createLead).toHaveBeenCalledExactlyOnceWith(createLeadSchema.parse(VALID), "staff-1");
    expect(vi.mocked(createLead).mock.calls[0][0]).toMatchObject({ phone: "+51938127170", ownerUserId: "staff-2" });
    expect(vi.mocked(createLead).mock.calls[0][0]).not.toHaveProperty("stage");
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/crm/leads");
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/crm/leads");
  });

  it.each([
    ["invalid_owner", "ownerUserId", "Ese responsable ya no tiene acceso. Elige otro."],
    ["invalid_trip", "tripId", "Ese viaje ya no está disponible."],
  ] as const)("con %s devuelve el error en su campo y conserva el formulario", async (code, field, message) => {
    vi.mocked(createLead).mockResolvedValue(code);
    expect(await createLeadAction(IDLE, form(VALID))).toEqual({
      status: "error", code, message, fieldErrors: { [field]: [message] }, values: VALID,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("si el service lanza, lanza un error fijo sin causa y sin escribir en consola", async () => {
    vi.mocked(createLead).mockRejectedValue(new Error("duplicate key: Ana Pérez +51938127170 postgres://secret"));
    const result = createLeadAction(IDLE, form(VALID));
    await expect(result).rejects.toThrow(new Error("lead action failed"));
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(consoleError).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
