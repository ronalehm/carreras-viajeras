// @vitest-environment node
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../services/offers.service", () => ({
  createOfferDraft: vi.fn(),
  createOfferVersionFrom: vi.fn(),
  updateOfferDraft: vi.fn(),
  approveOffer: vi.fn(),
  activateOffer: vi.fn(),
  closeOffer: vi.fn(),
  getOfferById: vi.fn(),
  listOffers: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ConfirmActionState } from "@/components/shared/ConfirmActionButton";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { can, type StaffRole } from "@/lib/auth/permissions";
import {
  activateOffer,
  approveOffer,
  closeOffer,
  createOfferDraft,
  createOfferVersionFrom,
  getOfferById,
  listOffers,
  updateOfferDraft,
} from "../services/offers.service";
import type { OfferActionState, OfferDetail, OfferListItem, OfferStatus } from "../types/offers.types";
import {
  activateOfferAction,
  approveOfferAction,
  closeOfferAction,
  createOfferAction,
  createOfferVersionAction,
  updateOfferAction,
} from "./offers.actions";

const IDLE: OfferActionState = { status: "idle" };
const OFFER_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const NEW_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const TRIP_ID = "6b0d7c1e-2f3a-4b5c-8d9e-0a1b2c3d4e5f";
const CAMPAIGN_ID = "1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a";

const OFFER_FIELDS = {
  name: " General Santiago ",
  totalPriceUsd: "2000",
  discountUsd: "200",
  depositOptionsUsd: "200, 100",
  balanceDueOn: "2027-03-15",
  bonusDescription: "Polo oficial",
  validFrom: "2026-11-01",
  validUntil: "2026-11-30",
  capacityLimit: "",
  termsVersion: " Santiago-2027-V1 ",
  conditions: "Condiciones de pago y cancelación.",
};
const CREATE = { ...OFFER_FIELDS, tripId: TRIP_ID, campaignId: "" };
const UPDATE = { ...OFFER_FIELDS, id: OFFER_ID };
const TRANSITION = { offerId: OFFER_ID };

// What the schema hands to the service for OFFER_FIELDS.
const PARSED_OFFER = {
  name: "General Santiago",
  totalPriceUsd: 2000,
  discountUsd: 200,
  depositOptionsUsd: [100, 200],
  balanceDueOn: "2027-03-15",
  bonusDescription: "Polo oficial",
  validFrom: "2026-11-01",
  validUntil: "2026-11-30",
  capacityLimit: null,
  termsVersion: "santiago-2027-v1",
  conditions: "Condiciones de pago y cancelación.",
};

// Keys a forged form may send: status, audit, computed or other-scope values never reach a service.
const INTRUDER = {
  status: "active",
  version: "7",
  finalPriceUsd: "1",
  approvedBy: "intruder",
  approvedAt: "2026-01-01",
  activatedBy: "intruder",
  closedBy: "intruder",
  createdBy: "intruder",
  supersededBy: NEW_ID,
  price: "1",
};

const PENDING_MESSAGE = "Ya hay una versión pendiente de esta oferta. Ábrela o descártala.";
const pendingMessage = (version: number) =>
  `Ya hay una versión pendiente (v${version}) de esta oferta. Ábrela o descártala.`;

const OTHER_TRIP_ID = "7c1e2f3a-4b5c-4d6e-9f0a-1b2c3d4e5f6a";
const OTHER_CAMPAIGN_ID = "2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b";

function version(
  number: number,
  status: OfferStatus,
  { tripId = TRIP_ID, campaignId = null }: { tripId?: string; campaignId?: string | null } = {},
): OfferListItem {
  return {
    id: `version-${number}-${status}`,
    version: number,
    status,
    name: "General Santiago",
    trip: { id: tripId, slug: "santiago", title: "Maratón de Santiago" },
    campaign: campaignId ? { id: campaignId, code: "c", name: "Campaña", status: "active" } : null,
    finalPriceUsd: 1800,
    validFrom: "2026-11-01",
    validUntil: null,
    approvedAt: null,
    activatedAt: null,
    closedAt: null,
  };
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

// The guard is mocked, but the decision uses the real permission matrix.
function signIn(roles: StaffRole[] = ["admin"], id = "admin-1") {
  vi.mocked(requirePermission).mockImplementation(async (permission) => {
    if (!can(roles, permission)) throw new ForbiddenError();
    return { id, email: "admin@example.com", emailVerified: true, staffRoles: roles };
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
  vi.mocked(createOfferDraft).mockResolvedValue({ id: NEW_ID });
  vi.mocked(createOfferVersionFrom).mockResolvedValue({ id: NEW_ID });
  vi.mocked(updateOfferDraft).mockResolvedValue("updated");
  vi.mocked(approveOffer).mockResolvedValue("approved");
  vi.mocked(activateOffer).mockResolvedValue("activated");
  vi.mocked(closeOffer).mockResolvedValue("closed");
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ACTIONS = [
  { name: "createOfferAction", run: () => createOfferAction(IDLE, form(CREATE)), service: createOfferDraft },
  { name: "updateOfferAction", run: () => updateOfferAction(IDLE, form(UPDATE)), service: updateOfferDraft },
  {
    name: "createOfferVersionAction",
    run: () => createOfferVersionAction(IDLE, form(TRANSITION)),
    service: createOfferVersionFrom,
  },
  { name: "approveOfferAction", run: () => approveOfferAction(IDLE, form(TRANSITION)), service: approveOffer },
  { name: "activateOfferAction", run: () => activateOfferAction(IDLE, form(TRANSITION)), service: activateOffer },
  { name: "closeOfferAction", run: () => closeOfferAction(IDLE, form(TRANSITION)), service: closeOffer },
];

describe.each(ACTIONS)("$name: permisos y errores en llamadas directas", ({ run, service }) => {
  it("sin sesión devuelve unauthorized y no llama al service", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new UnauthorizedError());
    expect(await run()).toEqual({
      status: "error", code: "unauthorized", message: "Tu sesión no es válida. Vuelve a iniciar sesión.",
    });
    expect(service).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each<[string, StaffRole[]]>([
    ["un commercial verificado", ["commercial"]],
    ["una cuenta sin rol de staff", []],
  ])("%s recibe forbidden sin llamar al service", async (_label, roles) => {
    signIn(roles);
    expect(await run()).toEqual({
      status: "error", code: "forbidden", message: "No tienes permiso para gestionar ofertas.",
    });
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith("offers.manage");
    expect(service).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("un error inesperado de la guarda se sustituye por el texto fijo, sin causa", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new Error("db down: user ana@example.com"));
    const result = run();
    await expect(result).rejects.toThrow(new Error("offer action failed"));
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(service).not.toHaveBeenCalled();
  });

  it("si el service lanza, lanza 'offer action failed' sin causa y sin escribir en consola", async () => {
    const spies = spyConsole();
    vi.mocked(service).mockRejectedValue(new Error("postgres://private-host password=secret"));
    const result = run();
    await expect(result).rejects.toThrow(new Error("offer action failed"));
    await expect(result).rejects.not.toHaveProperty("cause");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("createOfferAction", () => {
  it("crea el borrador con el id de la sesión, ignora campos extra, revalida la lista y redirige a la ficha", async () => {
    signIn(["admin"], "session-user");
    const data = form({ ...CREATE, ...INTRUDER });
    await expect(createOfferAction(IDLE, data)).rejects.toBeInstanceOf(RedirectSignal);
    expect(createOfferDraft).toHaveBeenCalledExactlyOnceWith(
      { ...PARSED_OFFER, tripId: TRIP_ID, campaignId: null },
      "session-user",
    );
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/crm/ofertas");
    expect(redirect).toHaveBeenCalledExactlyOnceWith(`/crm/ofertas/${NEW_ID}`);
  });

  it("pasa la campaña elegida al service", async () => {
    await expect(createOfferAction(IDLE, form({ ...CREATE, campaignId: CAMPAIGN_ID }))).rejects.toBeInstanceOf(
      RedirectSignal,
    );
    expect(vi.mocked(createOfferDraft).mock.calls[0][0]).toMatchObject({ campaignId: CAMPAIGN_ID });
  });

  it("con datos inválidos devuelve invalid_input con fieldErrors y lo escrito, sin llamar al service", async () => {
    const data = form({ ...CREATE, totalPriceUsd: "0", balanceDueOn: "", secret: "no-devolver" });
    const result = await createOfferAction(IDLE, data);
    expect(result).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: {
        totalPriceUsd: ["Indica el precio total en dólares, sin decimales."],
        balanceDueOn: ["Indica hasta cuándo se paga el saldo."],
      },
      values: { ...CREATE, totalPriceUsd: "0", balanceDueOn: "" },
    });
    expect(createOfferDraft).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("omite archivos y campos ausentes al devolver los valores", async () => {
    const data = form({ ...CREATE, name: "G" });
    data.delete("capacityLimit");
    data.set("conditions", new File(["x"], "conditions.txt"));
    const result = await createOfferAction(IDLE, data);
    expect(result).toMatchObject({ status: "error", code: "invalid_input" });
    if (result.status === "error") {
      expect(result.values).not.toHaveProperty("capacityLimit");
      expect(result.values).not.toHaveProperty("conditions");
      expect(result.values).toMatchObject({ name: "G", tripId: TRIP_ID });
    }
  });

  it.each([
    ["invalid_trip", "Elige un viaje del catálogo.", "tripId"],
    ["invalid_campaign", "Elige una campaña activa de ese viaje.", "campaignId"],
  ] as const)("%s devuelve su mensaje bajo su campo y lo escrito", async (code, message, field) => {
    vi.mocked(createOfferDraft).mockResolvedValue(code);
    expect(await createOfferAction(IDLE, form(CREATE))).toEqual({
      status: "error", code, message, fieldErrors: { [field]: [message] }, values: CREATE,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  describe("pending_exists", () => {
    beforeEach(() => {
      vi.mocked(createOfferDraft).mockResolvedValue("pending_exists");
    });

    it("indica la versión pendiente de la oferta general del viaje, sin confundirla con otros ámbitos", async () => {
      vi.mocked(listOffers).mockResolvedValue([
        version(9, "draft", { tripId: OTHER_TRIP_ID }),
        version(8, "approved", { campaignId: CAMPAIGN_ID }),
        version(3, "active"),
        version(2, "draft"),
        version(1, "closed"),
      ]);
      expect(await createOfferAction(IDLE, form(CREATE))).toEqual({
        status: "error", code: "pending_exists", message: pendingMessage(2), values: CREATE,
      });
      expect(listOffers).toHaveBeenCalledOnce();
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    });

    it("indica la versión aprobada pendiente de la campaña elegida", async () => {
      const data = { ...CREATE, campaignId: CAMPAIGN_ID };
      vi.mocked(listOffers).mockResolvedValue([
        version(5, "draft"),
        version(4, "draft", { campaignId: OTHER_CAMPAIGN_ID }),
        version(2, "approved", { campaignId: CAMPAIGN_ID }),
        version(1, "active", { campaignId: CAMPAIGN_ID }),
      ]);
      expect(await createOfferAction(IDLE, form(data))).toEqual({
        status: "error", code: "pending_exists", message: pendingMessage(2), values: data,
      });
    });

    it("si ya no encuentra la versión pendiente (carrera concurrente), devuelve el mensaje sin número", async () => {
      vi.mocked(listOffers).mockResolvedValue([version(3, "active"), version(2, "closed")]);
      expect(await createOfferAction(IDLE, form(CREATE))).toEqual({
        status: "error", code: "pending_exists", message: PENDING_MESSAGE, values: CREATE,
      });
      expect(redirect).not.toHaveBeenCalled();
    });

    it("si la lectura de la versión falla, lanza el error fijo sin causa y sin escribir en consola", async () => {
      const spies = spyConsole();
      vi.mocked(listOffers).mockRejectedValue(new Error("connection refused 10.0.0.1"));
      const result = createOfferAction(IDLE, form(CREATE));
      await expect(result).rejects.toThrow(new Error("offer action failed"));
      await expect(result).rejects.not.toHaveProperty("cause");
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    });
  });

  it("un error con la forma de Drizzle no se propaga, no se encadena y no se registra", async () => {
    const spies = spyConsole();
    const original = new DrizzleQueryError(
      'insert into "trip_offers" ("name") values ($1)',
      ["General Santiago", "admin-1"],
      new Error('duplicate key value violates unique constraint "trip_offers_general_pending_uq"'),
    );
    vi.mocked(createOfferDraft).mockRejectedValue(original);

    let thrown: unknown;
    try {
      await createOfferAction(IDLE, form(CREATE));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(DrizzleQueryError);
    const error = thrown as Error;
    expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
    expect(error.message).toBe("offer action failed");
    expect(error).not.toHaveProperty("cause");
    for (const secret of ["General Santiago", "trip_offers_general_pending_uq", "admin-1"]) {
      expect(error.message).not.toContain(secret);
      expect(error.stack ?? "").not.toContain(secret);
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("updateOfferAction", () => {
  it("guarda el borrador sin tripId, campaignId, estado ni auditoría, y revalida la ficha", async () => {
    const data = form({ ...UPDATE, ...INTRUDER, tripId: TRIP_ID, campaignId: CAMPAIGN_ID });
    expect(await updateOfferAction(IDLE, data)).toEqual({ status: "success", message: "Borrador guardado." });
    expect(updateOfferDraft).toHaveBeenCalledExactlyOnceWith(OFFER_ID, PARSED_OFFER);
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith(`/crm/ofertas/${OFFER_ID}`);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("con datos inválidos devuelve invalid_input con fieldErrors y lo escrito", async () => {
    const result = await updateOfferAction(IDLE, form({ ...UPDATE, id: "abc", discountUsd: "2000" }));
    expect(result).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: {
        id: ["La oferta no es válida."],
        discountUsd: ["El descuento debe ser menor que el precio total."],
      },
      values: { ...UPDATE, id: "abc", discountUsd: "2000" },
    });
    expect(updateOfferDraft).not.toHaveBeenCalled();
  });

  it.each([
    ["not_draft", "Esta versión ya está aprobada y no se puede editar. Crea una versión nueva."],
    ["not_found", "La oferta ya no existe. Recarga la página."],
  ] as const)("%s devuelve su mensaje sin revalidar", async (code, message) => {
    vi.mocked(updateOfferDraft).mockResolvedValue(code);
    expect(await updateOfferAction(IDLE, form(UPDATE))).toEqual({
      status: "error", code, message, values: UPDATE,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("createOfferVersionAction", () => {
  it("crea la versión con el id de la sesión, revalida lista y ficha de origen y redirige al borrador nuevo", async () => {
    signIn(["admin"], "session-user");
    const data = form({ ...TRANSITION, ...INTRUDER });
    await expect(createOfferVersionAction(IDLE, data)).rejects.toBeInstanceOf(RedirectSignal);
    expect(createOfferVersionFrom).toHaveBeenCalledExactlyOnceWith(OFFER_ID, "session-user");
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/crm/ofertas");
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/ofertas/${OFFER_ID}`);
    expect(redirect).toHaveBeenCalledExactlyOnceWith(`/crm/ofertas/${NEW_ID}`);
  });

  it("not_found devuelve su mensaje sin redirigir ni releer la oferta", async () => {
    vi.mocked(createOfferVersionFrom).mockResolvedValue("not_found");
    expect(await createOfferVersionAction(IDLE, form(TRANSITION))).toEqual({
      status: "error", code: "not_found", message: "La oferta ya no existe. Recarga la página.", values: TRANSITION,
    });
    expect(getOfferById).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  describe("pending_exists", () => {
    beforeEach(() => {
      vi.mocked(createOfferVersionFrom).mockResolvedValue("pending_exists");
    });

    it.each<[OfferStatus, number]>([
      ["draft", 4],
      ["approved", 3],
    ])("indica la versión pendiente (%s) del historial del ámbito", async (status, number) => {
      vi.mocked(getOfferById).mockResolvedValue({
        history: [version(number, status), version(2, "active"), version(1, "closed")],
      } as OfferDetail);
      expect(await createOfferVersionAction(IDLE, form(TRANSITION))).toEqual({
        status: "error", code: "pending_exists", message: pendingMessage(number), values: TRANSITION,
      });
      expect(getOfferById).toHaveBeenCalledExactlyOnceWith(OFFER_ID);
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    });

    it.each<[string, OfferDetail | null]>([
      ["el historial ya no tiene versión pendiente", { history: [version(2, "active")] } as OfferDetail],
      ["la oferta ya no existe", null],
    ])("si %s (carrera concurrente), devuelve el mensaje sin número", async (_label, offer) => {
      vi.mocked(getOfferById).mockResolvedValue(offer);
      expect(await createOfferVersionAction(IDLE, form(TRANSITION))).toEqual({
        status: "error", code: "pending_exists", message: PENDING_MESSAGE, values: TRANSITION,
      });
      expect(redirect).not.toHaveBeenCalled();
    });

    it("si la lectura de la versión falla, lanza el error fijo sin causa y sin escribir en consola", async () => {
      const spies = spyConsole();
      vi.mocked(getOfferById).mockRejectedValue(new Error("connection refused 10.0.0.1"));
      const result = createOfferVersionAction(IDLE, form(TRANSITION));
      await expect(result).rejects.toThrow(new Error("offer action failed"));
      await expect(result).rejects.not.toHaveProperty("cause");
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    });
  });
});

describe.each([
  {
    name: "approveOfferAction",
    action: approveOfferAction,
    service: approveOffer,
    success: "Versión aprobada. Ya no se puede editar.",
  },
  { name: "activateOfferAction", action: activateOfferAction, service: activateOffer, success: "Oferta activa." },
  { name: "closeOfferAction", action: closeOfferAction, service: closeOffer, success: "Oferta cerrada." },
])("$name: transición", ({ action, service, success }) => {
  it("usa el id de la sesión, ignora campos extra y revalida lista y ficha", async () => {
    signIn(["admin"], "session-user");
    expect(await action(IDLE, form({ ...TRANSITION, ...INTRUDER }))).toEqual({ status: "success", message: success });
    expect(service).toHaveBeenCalledExactlyOnceWith(OFFER_ID, "session-user");
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/crm/ofertas");
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/ofertas/${OFFER_ID}`);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("un id que no es UUID devuelve invalid_input sin llamar al service", async () => {
    expect(await action(IDLE, form({ offerId: "abc", secret: "x" }))).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: { offerId: ["La oferta no es válida."] },
      values: { offerId: "abc" },
    });
    expect(service).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("invalid_transition devuelve su mensaje sin revalidar", async () => {
    vi.mocked(service).mockResolvedValue("invalid_transition");
    expect(await action(IDLE, form(TRANSITION))).toEqual({
      status: "error",
      code: "invalid_transition",
      message: "La oferta ya no está en ese estado. Recarga la página.",
      values: TRANSITION,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("su resultado encaja en ConfirmActionState (status y message)", async () => {
    const ok: ConfirmActionState = await action(IDLE, form(TRANSITION));
    expect(ok).toMatchObject({ status: "success", message: success });
    vi.mocked(service).mockResolvedValue("invalid_transition");
    const error: ConfirmActionState = await action(IDLE, form(TRANSITION));
    expect(error).toMatchObject({ status: "error" });
  });
});

describe("approveOfferAction", () => {
  it("expired devuelve su mensaje sin revalidar", async () => {
    vi.mocked(approveOffer).mockResolvedValue("expired");
    expect(await approveOfferAction(IDLE, form(TRANSITION))).toEqual({
      status: "error", code: "expired", message: "La vigencia ya terminó. Crea una versión nueva.", values: TRANSITION,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("activateOfferAction", () => {
  it.each([
    ["expired", "La vigencia ya terminó. Crea una versión nueva."],
    ["trip_archived", "El viaje está archivado."],
    ["campaign_closed", "La campaña está cerrada."],
  ] as const)("%s devuelve su mensaje sin revalidar", async (code, message) => {
    vi.mocked(activateOffer).mockResolvedValue(code);
    expect(await activateOfferAction(IDLE, form(TRANSITION))).toEqual({
      status: "error", code, message, values: TRANSITION,
    });
    expect(getOfferById).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("not_started indica la fecha de inicio guardada en la versión, no la del formulario", async () => {
    vi.mocked(activateOffer).mockResolvedValue("not_started");
    vi.mocked(getOfferById).mockResolvedValue({ validFrom: "2026-11-01" } as OfferDetail);
    const data = form({ ...TRANSITION, validFrom: "2020-01-01" });
    expect(await activateOfferAction(IDLE, data)).toEqual({
      status: "error",
      code: "not_started",
      message: "La vigencia aún no ha empezado. Actívala a partir del 1 de noviembre de 2026.",
      values: TRANSITION,
    });
    expect(getOfferById).toHaveBeenCalledExactlyOnceWith(OFFER_ID);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("not_started de una versión que ya no se encuentra devuelve not_found", async () => {
    vi.mocked(activateOffer).mockResolvedValue("not_started");
    vi.mocked(getOfferById).mockResolvedValue(null);
    expect(await activateOfferAction(IDLE, form(TRANSITION))).toEqual({
      status: "error", code: "not_found", message: "La oferta ya no existe. Recarga la página.", values: TRANSITION,
    });
  });

  it("si la lectura de la fecha falla, lanza el error fijo sin causa", async () => {
    vi.mocked(activateOffer).mockResolvedValue("not_started");
    vi.mocked(getOfferById).mockRejectedValue(new Error("connection refused 10.0.0.1"));
    const result = activateOfferAction(IDLE, form(TRANSITION));
    await expect(result).rejects.toThrow(new Error("offer action failed"));
    await expect(result).rejects.not.toHaveProperty("cause");
  });
});
