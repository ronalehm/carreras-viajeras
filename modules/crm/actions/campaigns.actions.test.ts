// @vitest-environment node
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../services/campaigns.service", () => ({
  createCampaign: vi.fn(),
  closeCampaign: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ConfirmActionState } from "@/components/shared/ConfirmActionButton";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { closeCampaign, createCampaign } from "../services/campaigns.service";
import type { CampaignActionState } from "../types/campaigns.types";
import { closeCampaignAction, createCampaignAction } from "./campaigns.actions";

const IDLE: CampaignActionState = { status: "idle" };
const CAMPAIGN_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const TRIP_ID = "6b0d7c1e-2f3a-4b5c-8d9e-0a1b2c3d4e5f";
const VALID = {
  code: " MML26 ",
  name: "QR stand MML",
  tripId: TRIP_ID,
  channel: "event",
  eventName: "Media Maratón de Lima 2026",
};
const CLOSE = { campaignId: CAMPAIGN_ID };

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

function spyConsole() {
  return (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
}

class RedirectSignal extends Error {}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(redirect).mockImplementation(() => {
    throw new RedirectSignal("NEXT_REDIRECT");
  });
  signIn();
  vi.mocked(createCampaign).mockResolvedValue({ id: CAMPAIGN_ID });
  vi.mocked(closeCampaign).mockResolvedValue("closed");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  { name: "createCampaignAction", run: () => createCampaignAction(IDLE, form(VALID)), service: createCampaign },
  { name: "closeCampaignAction", run: () => closeCampaignAction(IDLE, form(CLOSE)), service: closeCampaign },
])("$name: permisos en llamadas directas", ({ run, service }) => {
  it("sin sesión devuelve unauthorized y no llama al service", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new UnauthorizedError());
    expect(await run()).toEqual({
      status: "error", code: "unauthorized", message: "Tu sesión no es válida. Vuelve a iniciar sesión.",
    });
    expect(service).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sin leads.manage devuelve forbidden y no llama al service", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new ForbiddenError());
    expect(await run()).toEqual({
      status: "error", code: "forbidden", message: "No tienes permiso para gestionar campañas.",
    });
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith("leads.manage");
    expect(service).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("un error inesperado de la guarda se sustituye por el texto fijo, sin causa", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new Error("db down: user ana@example.com"));
    const result = run();
    await expect(result).rejects.toThrow(new Error("campaign action failed"));
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(service).not.toHaveBeenCalled();
  });

  it("si el service lanza, lanza 'campaign action failed' sin causa y sin escribir en consola", async () => {
    const spies = spyConsole();
    vi.mocked(service).mockRejectedValue(new Error("postgres://private-host password=secret"));
    const result = run();
    await expect(result).rejects.toThrow(new Error("campaign action failed"));
    await expect(result).rejects.not.toHaveProperty("cause");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("createCampaignAction", () => {
  it("con datos válidos crea con el id de la sesión, revalida la lista y redirige al detalle", async () => {
    signIn("session-user");
    const data = form({
      ...VALID,
      status: "closed",
      createdBy: "intruder",
      closedAt: "2026-10-01",
      closedBy: "intruder",
    });
    await expect(createCampaignAction(IDLE, data)).rejects.toBeInstanceOf(RedirectSignal);
    expect(createCampaign).toHaveBeenCalledExactlyOnceWith(
      {
        code: "mml26",
        name: "QR stand MML",
        tripId: TRIP_ID,
        channel: "event",
        eventName: "Media Maratón de Lima 2026",
      },
      "session-user",
    );
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/crm/campanas");
    expect(redirect).toHaveBeenCalledExactlyOnceWith(`/crm/campanas/${CAMPAIGN_ID}`);
  });

  it("un evento vacío llega al service como null", async () => {
    await expect(createCampaignAction(IDLE, form({ ...VALID, eventName: "" }))).rejects.toBeInstanceOf(
      RedirectSignal,
    );
    expect(vi.mocked(createCampaign).mock.calls[0][0]).toMatchObject({ eventName: null });
  });

  it("con datos inválidos devuelve invalid_input con fieldErrors y values, sin llamar al service", async () => {
    const data = form({ ...VALID, code: "-mml", channel: "unknown", secret: "no-devolver" });
    const result = await createCampaignAction(IDLE, data);
    expect(result).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: {
        code: ["El código debe tener de 3 a 32 caracteres: minúsculas, números y guiones."],
        channel: ["Elige el canal."],
      },
      values: { ...VALID, code: "-mml", channel: "unknown" },
    });
    if (result.status === "error") expect(JSON.stringify(result.fieldErrors)).not.toContain("-mml");
    expect(createCampaign).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("omite archivos y campos ausentes al devolver los valores", async () => {
    const data = form({ ...VALID, name: "Q" });
    data.delete("eventName");
    data.set("code", new File(["x"], "code.txt"));
    const result = await createCampaignAction(IDLE, data);
    expect(result).toMatchObject({ status: "error", code: "invalid_input" });
    if (result.status === "error") {
      expect(result.values).toEqual({ name: "Q", tripId: TRIP_ID, channel: "event" });
    }
  });

  it("un código en uso devuelve code_taken con el error bajo el código y lo escrito", async () => {
    vi.mocked(createCampaign).mockResolvedValue("code_taken");
    expect(await createCampaignAction(IDLE, form(VALID))).toEqual({
      status: "error",
      code: "code_taken",
      message: "Ese código ya está en uso.",
      fieldErrors: { code: ["Ese código ya está en uso."] },
      values: VALID,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("un viaje archivado o inexistente devuelve invalid_trip con el error bajo el viaje", async () => {
    vi.mocked(createCampaign).mockResolvedValue("invalid_trip");
    expect(await createCampaignAction(IDLE, form(VALID))).toEqual({
      status: "error",
      code: "invalid_trip",
      message: "Elige un viaje del catálogo.",
      fieldErrors: { tripId: ["Elige un viaje del catálogo."] },
      values: VALID,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("un error con la forma de Drizzle no se propaga, no se encadena y no se registra", async () => {
    const spies = spyConsole();
    const original = new DrizzleQueryError(
      'insert into "campaigns" ("code", "name") values ($1, $2)',
      ["mml26", "QR stand MML", "staff-1"],
      new Error('duplicate key value violates unique constraint "campaigns_code_uq"'),
    );
    vi.mocked(createCampaign).mockRejectedValue(original);

    let thrown: unknown;
    try {
      await createCampaignAction(IDLE, form(VALID));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(DrizzleQueryError);
    const error = thrown as Error;
    expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
    expect(error.message).toBe("campaign action failed");
    expect(error).not.toHaveProperty("cause");
    for (const secret of ["mml26", "QR stand MML", "campaigns_code_uq", "params"]) {
      expect(error.message).not.toContain(secret);
      expect(error.stack ?? "").not.toContain(secret);
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("closeCampaignAction", () => {
  it("cierra con el id de la sesión, revalida lista y detalle e ignora campos extra", async () => {
    signIn("session-user");
    const data = form({ ...CLOSE, closedBy: "intruder", status: "active" });
    expect(await closeCampaignAction(IDLE, data)).toEqual({ status: "success", message: "Campaña cerrada." });
    expect(closeCampaign).toHaveBeenCalledExactlyOnceWith(CAMPAIGN_ID, "session-user");
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/crm/campanas");
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/campanas/${CAMPAIGN_ID}`);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("un id que no es UUID devuelve invalid_input sin llamar al service", async () => {
    expect(await closeCampaignAction(IDLE, form({ campaignId: "abc", secret: "x" }))).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: { campaignId: ["La campaña no es válida."] },
      values: { campaignId: "abc" },
    });
    expect(closeCampaign).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("una campaña ya cerrada o inexistente devuelve not_found sin revalidar", async () => {
    vi.mocked(closeCampaign).mockResolvedValue("not_found");
    expect(await closeCampaignAction(IDLE, form(CLOSE))).toEqual({
      status: "error",
      code: "not_found",
      message: "La campaña ya estaba cerrada o no existe. Recarga la página.",
      values: CLOSE,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("su resultado encaja en ConfirmActionState (status y message)", async () => {
    const success: ConfirmActionState = await closeCampaignAction(IDLE, form(CLOSE));
    expect(success).toMatchObject({ status: "success", message: "Campaña cerrada." });
    vi.mocked(closeCampaign).mockResolvedValue("not_found");
    const error: ConfirmActionState = await closeCampaignAction(IDLE, form(CLOSE));
    expect(error).toMatchObject({ status: "error" });
  });
});
