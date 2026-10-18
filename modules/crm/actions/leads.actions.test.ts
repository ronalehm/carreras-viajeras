// @vitest-environment node
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../services/leads.service", () => ({ createLead: vi.fn() }));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { createLeadSchema } from "../schemas/leads.schema";
import { createLead } from "../services/leads.service";
import type { LeadActionState } from "../types/leads.types";
import { createLeadAction } from "./leads.actions";

const IDLE: LeadActionState = { status: "idle" };
const LEAD_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const TRIP_ID = "6b0d7c1e-2f3a-4b5c-8d9e-0a1b2c3d4e5f";
const VALID = {
  fullName: "Ana Pérez",
  phone: "+51 938 127 170",
  email: "",
  location: "",
  tripId: "",
  destinationText: "",
  source: "whatsapp",
  ownerUserId: "staff-1",
  note: "",
  consent: "on",
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function signIn(id = "staff-1") {
  vi.mocked(requirePermission).mockResolvedValue({
    id, email: "agent@example.com", emailVerified: true, staffRoles: ["commercial"],
  });
}

class RedirectSignal extends Error {}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(redirect).mockImplementation(() => {
    throw new RedirectSignal("NEXT_REDIRECT");
  });
  signIn();
  vi.mocked(createLead).mockResolvedValue({ id: LEAD_ID });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createLeadAction: permisos en llamadas directas", () => {
  it("sin sesión devuelve unauthorized y no llama al service", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new UnauthorizedError());
    expect(await createLeadAction(IDLE, form(VALID))).toEqual({
      status: "error", code: "unauthorized", message: "Tu sesión no es válida. Vuelve a iniciar sesión.",
    });
    expect(createLead).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("una cuenta runner (sin rol de staff) devuelve forbidden y no llama al service", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new ForbiddenError());
    expect(await createLeadAction(IDLE, form({ ...VALID, role: "admin" }))).toEqual({
      status: "error", code: "forbidden", message: "No tienes permiso para gestionar leads.",
    });
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith("leads.manage");
    expect(createLead).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("un error inesperado de la guarda se sustituye por el texto fijo, sin causa", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new Error("db down: user ana@example.com"));
    const result = createLeadAction(IDLE, form(VALID));
    await expect(result).rejects.toThrow(new Error("lead action failed"));
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(createLead).not.toHaveBeenCalled();
  });
});

describe("createLeadAction", () => {
  it("con datos válidos crea con el id de la sesión como autor, revalida y redirige a la lista", async () => {
    signIn("session-user");
    const data = form({ ...VALID, stage: "paid", createdBy: "intruder", consentVersion: "fake", actorUserId: "x" });
    await expect(createLeadAction(IDLE, data)).rejects.toBeInstanceOf(RedirectSignal);
    expect(createLead).toHaveBeenCalledExactlyOnceWith(createLeadSchema.parse(VALID), "session-user");
    expect(vi.mocked(createLead).mock.calls[0][0]).not.toHaveProperty("stage");
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/crm/leads");
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/crm/leads");
  });

  it("con datos inválidos devuelve invalid_input con fieldErrors y values, sin llamar al service", async () => {
    const data = form({ ...VALID, phone: "987 654 321", consent: "", secret: "no-devolver" });
    data.delete("consent");
    const result = await createLeadAction(IDLE, data);
    expect(result).toMatchObject({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: {
        phone: ["Escribe el número con código de país, p. ej. +51 938 127 170."],
        consent: ["Confirma que el contacto aceptó que guardemos sus datos."],
      },
      values: { fullName: "Ana Pérez", phone: "987 654 321", source: "whatsapp", ownerUserId: "staff-1" },
    });
    if (result.status === "error") {
      expect(result.values).not.toHaveProperty("secret");
      expect(result.values).not.toHaveProperty("consent");
      // Validation messages never repeat what was typed.
      expect(JSON.stringify(result.fieldErrors)).not.toContain("987 654 321");
    }
    expect(createLead).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("omite archivos al devolver los valores", async () => {
    const data = form({ ...VALID, fullName: "A" });
    data.set("note", new File(["x"], "note.txt"));
    const result = await createLeadAction(IDLE, data);
    expect(result).toMatchObject({ code: "invalid_input" });
    if (result.status === "error") expect(result.values).not.toHaveProperty("note");
  });

  it.each([
    ["invalid_owner", "ownerUserId", "Ese responsable ya no tiene acceso. Elige otro."],
    ["invalid_trip", "tripId", "Ese viaje ya no está disponible."],
  ] as const)("con %s devuelve el error con el mensaje en su campo y conserva lo escrito", async (code, field, message) => {
    vi.mocked(createLead).mockResolvedValue(code);
    const values = { ...VALID, tripId: TRIP_ID };
    expect(await createLeadAction(IDLE, form(values))).toEqual({
      status: "error", code, message, fieldErrors: { [field]: [message] }, values,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("createLeadAction: errores del service", () => {
  function spyConsole() {
    return ["error", "warn", "log", "info", "debug"].map((method) =>
      vi.spyOn(console, method as "error").mockImplementation(() => {}),
    );
  }

  it("si el service lanza, lanza 'lead action failed' sin el mensaje original y sin escribir en consola", async () => {
    const spies = spyConsole();
    vi.mocked(createLead).mockRejectedValue(new Error("postgres://private-host password=secret"));
    const result = createLeadAction(IDLE, form(VALID));
    await expect(result).rejects.toThrow(new Error("lead action failed"));
    await expect(result).rejects.not.toHaveProperty("cause");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("un error con la forma de Drizzle no se propaga, no se encadena y no se registra", async () => {
    const spies = spyConsole();
    const original = new DrizzleQueryError(
      'insert into "leads" ("full_name", "phone") values ($1, $2)',
      ["Ana Pérez", "+51938127170", "ana@example.com"],
      new Error('duplicate key value violates unique constraint "leads_pkey"'),
    );
    expect(original.message).toContain("Ana Pérez");
    expect(original.message).toContain("+51938127170");
    vi.mocked(createLead).mockRejectedValue(original);

    let thrown: unknown;
    try {
      await createLeadAction(IDLE, form(VALID));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBe(original);
    expect(thrown).not.toBeInstanceOf(DrizzleQueryError);
    const error = thrown as Error;
    expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
    expect(error.message).toBe("lead action failed");
    expect(error).not.toHaveProperty("cause");
    expect(Object.keys(error)).toEqual([]);
    for (const secret of ["Ana Pérez", "+51938127170", "ana@example.com", "Failed query", "params"]) {
      expect(error.message).not.toContain(secret);
      expect(error.stack ?? "").not.toContain(secret);
    }
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      expect(spy.mock.calls.flat()).not.toContain(original);
    }
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
