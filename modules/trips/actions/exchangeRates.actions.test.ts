// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../services/exchangeRates.service", () => ({ setExchangeRate: vi.fn() }));

import { revalidatePath } from "next/cache";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { can, type StaffRole } from "@/lib/auth/permissions";
import { setExchangeRate } from "../services/exchangeRates.service";
import type { ExchangeRateActionState } from "../types/offers.types";
import { setExchangeRateAction } from "./exchangeRates.actions";

const IDLE: ExchangeRateActionState = { status: "idle" };
const RATE_MESSAGE = "Indica el tipo con punto decimal y hasta 4 decimales (p. ej. 3.7500).";

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

beforeEach(() => {
  vi.resetAllMocks();
  signIn();
  vi.mocked(setExchangeRate).mockResolvedValue({ id: "rate-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("setExchangeRateAction", () => {
  it("guarda el tipo normalizado con el id de la sesión, ignora campos extra y revalida /crm/ofertas", async () => {
    signIn(["admin"], "session-user");
    const data = form({ usdPen: " 3.7512 ", createdBy: "intruder", createdAt: "2020-01-01", id: "x" });
    expect(await setExchangeRateAction(IDLE, data)).toEqual({
      status: "success", message: "Tipo de cambio guardado.",
    });
    expect(setExchangeRate).toHaveBeenCalledExactlyOnceWith("3.7512", "session-user");
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/crm/ofertas");
  });

  it("normaliza 3.75 a 3.7500", async () => {
    await setExchangeRateAction(IDLE, form({ usdPen: "3.75" }));
    expect(setExchangeRate).toHaveBeenCalledExactlyOnceWith("3.7500", "admin-1");
  });

  it.each(["3,75", "0", "3.12345", ""])(
    "con %j devuelve invalid_input con el mensaje del campo y lo escrito, sin llamar al service",
    async (usdPen) => {
      expect(await setExchangeRateAction(IDLE, form({ usdPen, secret: "no-devolver" }))).toEqual({
        status: "error",
        code: "invalid_input",
        message: "Revisa los campos marcados.",
        fieldErrors: { usdPen: [RATE_MESSAGE] },
        values: { usdPen },
      });
      expect(setExchangeRate).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("sin el campo devuelve invalid_input sin valores que repetir", async () => {
    const result = await setExchangeRateAction(IDLE, form({}));
    expect(result).toMatchObject({ status: "error", code: "invalid_input", values: {} });
    expect(setExchangeRate).not.toHaveBeenCalled();
  });

  it("sin sesión devuelve unauthorized y no llama al service", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new UnauthorizedError());
    expect(await setExchangeRateAction(IDLE, form({ usdPen: "3.75" }))).toEqual({
      status: "error", code: "unauthorized", message: "Tu sesión no es válida. Vuelve a iniciar sesión.",
    });
    expect(setExchangeRate).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each<[string, StaffRole[]]>([
    ["un commercial verificado", ["commercial"]],
    ["una cuenta sin rol de staff", []],
  ])("%s recibe forbidden sin llamar al service", async (_label, roles) => {
    signIn(roles);
    expect(await setExchangeRateAction(IDLE, form({ usdPen: "3.75" }))).toEqual({
      status: "error", code: "forbidden", message: "No tienes permiso para gestionar ofertas.",
    });
    expect(requirePermission).toHaveBeenCalledExactlyOnceWith("offers.manage");
    expect(setExchangeRate).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("un error inesperado de la guarda se sustituye por el texto fijo, sin causa", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new Error("db down: user ana@example.com"));
    const result = setExchangeRateAction(IDLE, form({ usdPen: "3.75" }));
    await expect(result).rejects.toThrow(new Error("exchange rate action failed"));
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(setExchangeRate).not.toHaveBeenCalled();
  });

  it("si el service lanza, lanza 'exchange rate action failed' sin causa y sin escribir en consola", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    vi.mocked(setExchangeRate).mockRejectedValue(new Error("exchange_rates_usd_pen_chk password=secret"));
    const result = setExchangeRateAction(IDLE, form({ usdPen: "3.75" }));
    await expect(result).rejects.toThrow(new Error("exchange rate action failed"));
    await expect(result).rejects.not.toHaveProperty("cause");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
