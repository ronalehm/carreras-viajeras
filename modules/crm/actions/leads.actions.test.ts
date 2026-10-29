// @vitest-environment node
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../services/leads.service", () => ({
  archiveLead: vi.fn(),
  createLead: vi.fn(),
  optOutLead: vi.fn(),
  updateLead: vi.fn(),
  changeLeadStage: vi.fn(),
  changeLeadOwner: vi.fn(),
  setNextAction: vi.fn(),
}));
vi.mock("../services/activities.service", () => ({ addLeadActivity: vi.fn() }));
vi.mock("@/modules/integrations", () => ({ retryClientEmail: vi.fn() }));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ConfirmActionState } from "@/components/shared/ConfirmActionButton";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { retryClientEmail } from "@/modules/integrations";
import { createLeadSchema } from "../schemas/leads.schema";
import { addLeadActivity } from "../services/activities.service";
import {
  archiveLead,
  changeLeadOwner,
  changeLeadStage,
  createLead,
  optOutLead,
  setNextAction,
  updateLead,
} from "../services/leads.service";
import type { LeadActionState } from "../types/leads.types";
import {
  addLeadActivityAction,
  archiveLeadAction,
  changeLeadOwnerAction,
  changeLeadStageAction,
  createLeadAction,
  optOutLeadAction,
  setNextActionAction,
  updateLeadAction,
  retryLeadEmailAction,
} from "./leads.actions";

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
  channel: "referral",
  originDetail: "",
  referredBy: "",
  contactPreference: "",
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

describe("retryLeadEmailAction", () => {
  it.each([new UnauthorizedError(), new ForbiddenError()])("authorizes before reading message data", async (error) => {
    vi.mocked(requirePermission).mockRejectedValue(error);
    const result = await retryLeadEmailAction(IDLE, form({ messageId: LEAD_ID }));
    expect(result.status).toBe("error");
    expect(requirePermission).toHaveBeenCalledWith("leads.manage");
    expect(retryClientEmail).not.toHaveBeenCalled();
  });
  it("rejects invalid IDs and derives the lead to revalidate from the service result", async () => {
    expect((await retryLeadEmailAction(IDLE, form({ messageId: "invalid" }))).status).toBe("error");
    expect(retryClientEmail).not.toHaveBeenCalled();
    vi.mocked(retryClientEmail).mockResolvedValue(TRIP_ID);
    const result = await retryLeadEmailAction(IDLE, form({ messageId: LEAD_ID, leadId: "tampered", to: "injected@example.test", actorUserId: "other" }));
    expect(result.status).toBe("success");
    expect(retryClientEmail).toHaveBeenCalledWith(LEAD_ID, "staff-1");
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/leads/${TRIP_ID}`);
    expect(revalidatePath).not.toHaveBeenCalledWith("/crm/leads/tampered");
  });
  it("reports a non-retryable state without invalidating pages", async () => {
    vi.mocked(retryClientEmail).mockResolvedValue(null);
    expect(await retryLeadEmailAction(IDLE, form({ messageId: LEAD_ID }))).toMatchObject({ status: "error", code: "email_not_retryable" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
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
  it("con datos válidos crea con el id de la sesión como autor, revalida la lista y redirige a la ficha", async () => {
    signIn("session-user");
    const data = form({ ...VALID, stage: "paid", createdBy: "intruder", consentVersion: "fake", actorUserId: "x" });
    await expect(createLeadAction(IDLE, data)).rejects.toBeInstanceOf(RedirectSignal);
    expect(createLead).toHaveBeenCalledExactlyOnceWith(createLeadSchema.parse(VALID), "session-user");
    expect(vi.mocked(createLead).mock.calls[0][0]).not.toHaveProperty("stage");
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/crm/leads");
    expect(redirect).toHaveBeenCalledExactlyOnceWith(`/crm/leads/${LEAD_ID}`);
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

  it("sin origen devuelve «Elige el origen del lead.» y conserva los campos de origen escritos", async () => {
    const values: Record<string, string> = {
      ...VALID,
      originDetail: "Media Maratón de Lima 2026",
      referredBy: "Club Runners Lima",
      referralPermission: "on",
      contactPreference: "call",
    };
    delete values.channel;
    const data = form({ ...values, utmSource: "instagram", contactOptOutAt: "2026-10-25" });

    expect(await createLeadAction(IDLE, data)).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: { channel: ["Elige el origen del lead."] },
      values,
    });
    expect(createLead).not.toHaveBeenCalled();
  });

  it("con origen, detalle, referente, permiso y preferencia los envía al service", async () => {
    const data = form({
      ...VALID,
      originDetail: " Media Maratón de Lima 2026 ",
      referredBy: "Club Runners Lima",
      referralPermission: "on",
      contactPreference: "call",
    });
    await expect(createLeadAction(IDLE, data)).rejects.toBeInstanceOf(RedirectSignal);
    expect(vi.mocked(createLead).mock.calls[0][0]).toMatchObject({
      channel: "referral",
      originDetail: "Media Maratón de Lima 2026",
      referredBy: "Club Runners Lima",
      referralPermission: true,
      contactPreference: "call",
    });
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

const EDIT = {
  leadId: LEAD_ID,
  fullName: "Ana Pérez",
  phone: "+51 999 888 777",
  email: "",
  location: "",
  tripId: TRIP_ID,
  destinationText: "",
  channel: "unknown",
  originDetail: "",
  referredBy: "",
  contactPreference: "",
};
const STAGE = { leadId: LEAD_ID, stage: "quoted", lostReason: "" };
const OWNER = { leadId: LEAD_ID, ownerUserId: "staff-2" };
const ACTIVITY = { leadId: LEAD_ID, type: "call", body: "Llamó por la 21K." };
const NEXT_ACTION = { leadId: LEAD_ID, nextActionDate: "2026-10-25", nextActionNote: "Enviar la cotización." };
const ARCHIVE = { leadId: LEAD_ID };
const OPT_OUT = { leadId: LEAD_ID };

type Action = (prev: LeadActionState, formData: FormData) => Promise<LeadActionState>;

const DETAIL_ACTIONS = [
  ["updateLeadAction", updateLeadAction, EDIT, updateLead],
  ["changeLeadStageAction", changeLeadStageAction, STAGE, changeLeadStage],
  ["changeLeadOwnerAction", changeLeadOwnerAction, OWNER, changeLeadOwner],
  ["addLeadActivityAction", addLeadActivityAction, ACTIVITY, addLeadActivity],
  ["setNextActionAction", setNextActionAction, NEXT_ACTION, setNextAction],
  ["archiveLeadAction", archiveLeadAction, ARCHIVE, archiveLead],
  ["optOutLeadAction", optOutLeadAction, OPT_OUT, optOutLead],
] as const satisfies readonly (readonly [string, Action, Record<string, string>, unknown])[];

describe("acciones de la ficha: permisos y errores del service", () => {
  it.each(DETAIL_ACTIONS)("%s sin sesión devuelve unauthorized y no llama al service", async (_, action, values, service) => {
    vi.mocked(requirePermission).mockRejectedValue(new UnauthorizedError());
    expect(await action(IDLE, form(values))).toMatchObject({ status: "error", code: "unauthorized" });
    expect(service).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(DETAIL_ACTIONS)("%s sin permiso (runner) devuelve forbidden y no llama al service", async (_, action, values, service) => {
    vi.mocked(requirePermission).mockRejectedValue(new ForbiddenError());
    expect(await action(IDLE, form(values))).toEqual({
      status: "error", code: "forbidden", message: "No tienes permiso para gestionar leads.",
    });
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith("leads.manage");
    expect(service).not.toHaveBeenCalled();
  });

  it.each(DETAIL_ACTIONS)("%s con datos inválidos devuelve invalid_input sin llamar al service", async (_, action, values, service) => {
    const result = await action(IDLE, form({ ...values, leadId: "abc", secret: "no-devolver" }));
    expect(result).toMatchObject({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: { leadId: ["El lead no es válido."] },
      values: { ...values, leadId: "abc" },
    });
    if (result.status === "error") expect(result.values).not.toHaveProperty("secret");
    expect(service).not.toHaveBeenCalled();
  });

  it.each(DETAIL_ACTIONS)("%s: si el service lanza, lanza 'lead action failed' sin causa ni consola", async (_, action, values, service) => {
    const spies = ["error", "warn", "log"].map((method) =>
      vi.spyOn(console, method as "error").mockImplementation(() => {}),
    );
    vi.mocked(service).mockRejectedValue(new Error('Failed query: update "leads" params: Ana Pérez,+51999888777'));
    let thrown: unknown;
    try {
      await action(IDLE, form(values));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toEqual(new Error("lead action failed"));
    expect(thrown).not.toHaveProperty("cause");
    expect((thrown as Error).stack ?? "").not.toContain("Ana Pérez");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each(DETAIL_ACTIONS)("%s con not_found devuelve el mensaje fijo y no revalida", async (_, action, values, service) => {
    vi.mocked(service).mockResolvedValue("not_found" as never);
    expect(await action(IDLE, form(values))).toEqual({
      status: "error",
      code: "not_found",
      message: "El lead ya no existe o está archivado. Recarga la página.",
      values,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("updateLeadAction", () => {
  it("guarda contacto y origen con el id de la sesión como autor, descarta campos extra, revalida y redirige", async () => {
    signIn("session-user");
    vi.mocked(updateLead).mockResolvedValue("updated");
    const data = form({
      ...EDIT,
      channel: "instagram",
      originDetail: " Reel de la 42K ",
      referredBy: "Club Runners Lima",
      referralPermission: "on",
      contactPreference: "whatsapp",
      stage: "paid",
      ownerUserId: "intruder",
      actorUserId: "intruder",
      source: "web_form",
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "santiago-2027",
      contactOptOutAt: "2026-10-25T10:00:00Z",
    });

    await expect(updateLeadAction(IDLE, data)).rejects.toBeInstanceOf(RedirectSignal);

    expect(updateLead).toHaveBeenCalledExactlyOnceWith(
      {
        leadId: LEAD_ID,
        fullName: "Ana Pérez",
        phone: "+51999888777",
        email: null,
        location: null,
        tripId: TRIP_ID,
        destinationText: null,
        channel: "instagram",
        originDetail: "Reel de la 42K",
        referredBy: "Club Runners Lima",
        referralPermission: true,
        contactPreference: "whatsapp",
      },
      "session-user",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/crm/leads");
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/leads/${LEAD_ID}`);
    expect(redirect).toHaveBeenCalledExactlyOnceWith(`/crm/leads/${LEAD_ID}`);
  });

  it("con un email inválido devuelve el error en su campo y conserva lo escrito", async () => {
    const values = { ...EDIT, email: "ana@" };
    expect(await updateLeadAction(IDLE, form(values))).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: { email: ["Introduce un correo válido."] },
      values,
    });
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("sin casilla de permiso envía referralPermission: false y las preferencias vacías como null", async () => {
    vi.mocked(updateLead).mockResolvedValue("updated");
    await expect(updateLeadAction(IDLE, form(EDIT))).rejects.toBeInstanceOf(RedirectSignal);
    expect(updateLead).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        channel: "unknown",
        originDetail: null,
        referredBy: null,
        referralPermission: false,
        contactPreference: null,
      }),
      "staff-1",
    );
  });

  it("con permiso y sin referente devuelve «Indica quién lo refirió.» y conserva los campos de origen", async () => {
    const values = { ...EDIT, channel: "referral", originDetail: "Club", referralPermission: "on", contactPreference: "call" };
    expect(await updateLeadAction(IDLE, form({ ...values, utmSource: "instagram" }))).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: { referredBy: ["Indica quién lo refirió."] },
      values,
    });
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("con invalid_trip devuelve el error en el campo del viaje", async () => {
    vi.mocked(updateLead).mockResolvedValue("invalid_trip");
    expect(await updateLeadAction(IDLE, form(EDIT))).toEqual({
      status: "error",
      code: "invalid_trip",
      message: "Ese viaje ya no está disponible.",
      fieldErrors: { tripId: ["Ese viaje ya no está disponible."] },
      values: EDIT,
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("changeLeadStageAction", () => {
  it("cambia la etapa con el id de la sesión como autor, ignora campos extra y revalida", async () => {
    signIn("session-user");
    vi.mocked(changeLeadStage).mockResolvedValue("changed");
    const data = form({ ...STAGE, lostReason: "x", actorUserId: "intruder" });

    expect(await changeLeadStageAction(IDLE, data)).toEqual({ status: "success", message: "Etapa actualizada." });
    expect(changeLeadStage).toHaveBeenCalledExactlyOnceWith(
      { leadId: LEAD_ID, stage: "quoted", lostReason: null },
      "session-user",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/crm/leads");
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/leads/${LEAD_ID}`);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("Perdido sin motivo muestra «Indica el motivo de la pérdida.» y no llama al service", async () => {
    const result = await changeLeadStageAction(IDLE, form({ ...STAGE, stage: "lost" }));
    expect(result).toMatchObject({
      code: "invalid_input",
      fieldErrors: { lostReason: ["Indica el motivo de la pérdida."] },
      values: { ...STAGE, stage: "lost" },
    });
    expect(changeLeadStage).not.toHaveBeenCalled();
  });

  it("Perdido con motivo envía el motivo al service", async () => {
    vi.mocked(changeLeadStage).mockResolvedValue("changed");
    await changeLeadStageAction(IDLE, form({ ...STAGE, stage: "lost", lostReason: " Eligió otra agencia " }));
    expect(changeLeadStage).toHaveBeenCalledExactlyOnceWith(
      { leadId: LEAD_ID, stage: "lost", lostReason: "Eligió otra agencia" },
      "staff-1",
    );
  });

  it("la misma etapa devuelve «No hay cambios.» sin revalidar", async () => {
    vi.mocked(changeLeadStage).mockResolvedValue("no_change");
    expect(await changeLeadStageAction(IDLE, form(STAGE))).toEqual({
      status: "error", code: "no_change", message: "No hay cambios.", values: STAGE,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("changeLeadOwnerAction", () => {
  it("reasigna con el id de la sesión como autor, ignora campos extra y revalida", async () => {
    signIn("session-user");
    vi.mocked(changeLeadOwner).mockResolvedValue("changed");
    const data = form({ ...OWNER, actorUserId: "intruder" });

    expect(await changeLeadOwnerAction(IDLE, data)).toEqual({
      status: "success", message: "Responsable actualizado.",
    });
    expect(changeLeadOwner).toHaveBeenCalledExactlyOnceWith(
      { leadId: LEAD_ID, ownerUserId: "staff-2" },
      "session-user",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/crm/leads");
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/leads/${LEAD_ID}`);
  });

  it("sin elegir responsable muestra «Elige un responsable.» y nunca deja el lead sin responsable", async () => {
    const result = await changeLeadOwnerAction(IDLE, form({ ...OWNER, ownerUserId: "" }));
    expect(result).toMatchObject({
      code: "invalid_input",
      fieldErrors: { ownerUserId: ["Elige un responsable."] },
    });
    expect(changeLeadOwner).not.toHaveBeenCalled();
  });

  it("con invalid_owner devuelve el error en el campo del responsable", async () => {
    vi.mocked(changeLeadOwner).mockResolvedValue("invalid_owner");
    expect(await changeLeadOwnerAction(IDLE, form(OWNER))).toEqual({
      status: "error",
      code: "invalid_owner",
      message: "Ese responsable ya no tiene acceso. Elige otro.",
      fieldErrors: { ownerUserId: ["Ese responsable ya no tiene acceso. Elige otro."] },
      values: OWNER,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("el mismo responsable devuelve «No hay cambios.»", async () => {
    vi.mocked(changeLeadOwner).mockResolvedValue("no_change");
    expect(await changeLeadOwnerAction(IDLE, form(OWNER))).toMatchObject({
      code: "no_change", message: "No hay cambios.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("addLeadActivityAction", () => {
  it("registra el seguimiento con el id de la sesión como autor, ignora campos extra y revalida la ficha", async () => {
    signIn("session-user");
    vi.mocked(addLeadActivity).mockResolvedValue("added");
    const data = form({ ...ACTIVITY, body: "  Llamó por la 21K.  ", actorUserId: "intruder", stageTo: "paid" });

    expect(await addLeadActivityAction(IDLE, data)).toEqual({
      status: "success", message: "Seguimiento registrado.",
    });
    expect(addLeadActivity).toHaveBeenCalledExactlyOnceWith(
      { leadId: LEAD_ID, type: "call", body: "Llamó por la 21K." },
      "session-user",
    );
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith(`/crm/leads/${LEAD_ID}`);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sin texto devuelve el error en su campo, conserva lo elegido y no crea nada", async () => {
    const result = await addLeadActivityAction(IDLE, form({ ...ACTIVITY, body: "   " }));
    expect(result).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: { body: ["Escribe el texto del seguimiento."] },
      values: { ...ACTIVITY, body: "   " },
    });
    expect(addLeadActivity).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["created", "stage_changed", "owner_changed", "archived", "automation"])(
    "nunca acepta el tipo de sistema %s desde el formulario",
    async (type) => {
      const result = await addLeadActivityAction(IDLE, form({ ...ACTIVITY, type }));
      expect(result).toMatchObject({
        code: "invalid_input",
        fieldErrors: { type: ["Elige el tipo de seguimiento."] },
      });
      expect(addLeadActivity).not.toHaveBeenCalled();
    },
  );
});

describe("setNextActionAction", () => {
  it("guarda la próxima acción, ignora campos extra (autor, etapa) y revalida la lista y la ficha", async () => {
    signIn("session-user");
    vi.mocked(setNextAction).mockResolvedValue("saved");
    const data = form({ ...NEXT_ACTION, nextActionNote: "  Enviar la cotización.  ", actorUserId: "intruder", stage: "paid" });

    expect(await setNextActionAction(IDLE, data)).toEqual({
      status: "success", message: "Próxima acción guardada.",
    });
    expect(setNextAction).toHaveBeenCalledExactlyOnceWith({
      leadId: LEAD_ID,
      nextActionDate: "2026-10-25",
      nextActionNote: "Enviar la cotización.",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/crm/leads");
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/leads/${LEAD_ID}`);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("con ambos campos vacíos quita la próxima acción", async () => {
    vi.mocked(setNextAction).mockResolvedValue("saved");
    expect(
      await setNextActionAction(IDLE, form({ ...NEXT_ACTION, nextActionDate: "", nextActionNote: "" })),
    ).toEqual({ status: "success", message: "Próxima acción quitada." });
    expect(setNextAction).toHaveBeenCalledExactlyOnceWith({
      leadId: LEAD_ID,
      nextActionDate: null,
      nextActionNote: null,
    });
  });

  it("una nota sin fecha muestra «Indica la fecha.» bajo la fecha, conserva la nota y no llama al service", async () => {
    const values = { ...NEXT_ACTION, nextActionDate: "" };
    expect(await setNextActionAction(IDLE, form(values))).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: { nextActionDate: ["Indica la fecha."] },
      values,
    });
    expect(setNextAction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("con un lead que pidió no seguir devuelve opted_out con su mensaje y no revalida", async () => {
    vi.mocked(setNextAction).mockResolvedValue("opted_out");
    expect(await setNextActionAction(IDLE, form(NEXT_ACTION))).toEqual({
      status: "error",
      code: "opted_out",
      message: "El contacto pidió no seguir: no se programan próximas acciones.",
      values: NEXT_ACTION,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("con un lead pagado o perdido devuelve closed y no revalida", async () => {
    vi.mocked(setNextAction).mockResolvedValue("closed");
    expect(await setNextActionAction(IDLE, form(NEXT_ACTION))).toEqual({
      status: "error",
      code: "closed",
      message: "El lead está cerrado o archivado.",
      values: NEXT_ACTION,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("archiveLeadAction", () => {
  it("archiva con el usuario de la sesión, ignora campos extra y revalida la lista y la ficha", async () => {
    signIn("session-user");
    vi.mocked(archiveLead).mockResolvedValue("archived");
    const data = form({ ...ARCHIVE, actorUserId: "intruder", archivedBy: "intruder" });

    expect(await archiveLeadAction(IDLE, data)).toEqual({ status: "success", message: "Lead archivado." });
    expect(archiveLead).toHaveBeenCalledExactlyOnceWith(LEAD_ID, "session-user");
    expect(revalidatePath).toHaveBeenCalledWith("/crm/leads");
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/leads/${LEAD_ID}`);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("su resultado encaja en ConfirmActionState (status y message)", async () => {
    vi.mocked(archiveLead).mockResolvedValue("archived");
    const success: ConfirmActionState = await archiveLeadAction(IDLE, form(ARCHIVE));
    expect(success).toEqual({ status: "success", message: "Lead archivado." });

    vi.mocked(archiveLead).mockResolvedValue("not_found");
    const error: ConfirmActionState = await archiveLeadAction(IDLE, form(ARCHIVE));
    expect(error).toMatchObject({
      status: "error",
      message: "El lead ya no existe o está archivado. Recarga la página.",
    });
  });
});

describe("optOutLeadAction", () => {
  const SMUGGLED = { actorUserId: "intruder", stage: "paid", lostReason: "Otro", contactOptOutAt: "2020-01-01" };

  it("registra la baja con el usuario de la sesión, ignora campos extra y revalida la lista y la ficha", async () => {
    signIn("session-user");
    vi.mocked(optOutLead).mockResolvedValue("opted_out");

    expect(await optOutLeadAction(IDLE, form({ ...OPT_OUT, ...SMUGGLED }))).toEqual({
      status: "success", message: "Registrado: pidió no seguir.",
    });
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith("leads.manage");
    expect(optOutLead).toHaveBeenCalledExactlyOnceWith(LEAD_ID, "session-user");
    expect(revalidatePath).toHaveBeenCalledWith("/crm/leads");
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/leads/${LEAD_ID}`);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("si ya tenía baja devuelve no_change con su mensaje, sin eco de campos extra, y revalida la lista y la ficha", async () => {
    vi.mocked(optOutLead).mockResolvedValue("no_change");
    expect(await optOutLeadAction(IDLE, form({ ...OPT_OUT, ...SMUGGLED }))).toEqual({
      status: "error",
      code: "no_change",
      message: "Ya estaba registrado que pidió no seguir.",
      values: OPT_OUT,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/crm/leads");
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/leads/${LEAD_ID}`);
  });

  it("con un lead inexistente o archivado devuelve not_found y no revalida", async () => {
    vi.mocked(optOutLead).mockResolvedValue("not_found");
    expect(await optOutLeadAction(IDLE, form(OPT_OUT))).toEqual({
      status: "error",
      code: "not_found",
      message: "El lead ya no existe o está archivado. Recarga la página.",
      values: OPT_OUT,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("su resultado encaja en ConfirmActionState (status y message)", async () => {
    vi.mocked(optOutLead).mockResolvedValue("opted_out");
    const success: ConfirmActionState = await optOutLeadAction(IDLE, form(OPT_OUT));
    expect(success).toEqual({ status: "success", message: "Registrado: pidió no seguir." });

    vi.mocked(optOutLead).mockResolvedValue("no_change");
    const error: ConfirmActionState = await optOutLeadAction(IDLE, form(OPT_OUT));
    expect(error).toMatchObject({ status: "error", message: "Ya estaba registrado que pidió no seguir." });
  });
});
