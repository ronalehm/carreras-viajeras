// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { auth, currentUser } = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));
vi.mock("@/lib/auth/access.service", () => ({
  acceptInvitationAndLoadStaffRoles: vi.fn(), loadStaffRoles: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../services/payments.service", () => ({ addPayment: vi.fn(), voidPayment: vi.fn() }));

import { revalidatePath } from "next/cache";
import { acceptInvitationAndLoadStaffRoles, loadStaffRoles } from "@/lib/auth/access.service";
import { paymentFormSchema } from "../schemas/bookings.schema";
import { addPayment, voidPayment } from "../services/payments.service";
import type { BookingActionState } from "../types/bookings.types";
import { addPaymentAction, voidPaymentAction } from "./payments.actions";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const PAYMENT_ID = "22222222-2222-4222-8222-222222222222";
const IDLE = { status: "idle" } as const;
const ADD = { bookingId: BOOKING_ID, amountUsd: "300", paidOn: "2027-03-03", concept: "Reserva" };
const VOID = { paymentId: PAYMENT_ID };
// Keys a client could add to try to set server-owned columns.
const SMUGGLED = { recordedBy: "user-x", voidedBy: "user-y" };
const NOT_FOUND = "La reserva o el pago ya no admiten cambios. Recarga la página.";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
function signIn(roles: ("commercial" | "admin")[], emailVerified = true) {
  auth.mockResolvedValue({ userId: "staff-1" });
  currentUser.mockResolvedValue({
    id: "staff-1",
    primaryEmailAddressId: "idn_primary",
    emailAddresses: [
      { id: "idn_primary", emailAddress: "agent@example.com", verification: { status: emailVerified ? "verified" : "unverified" } },
    ],
  });
  vi.mocked(acceptInvitationAndLoadStaffRoles).mockResolvedValue(roles);
  vi.mocked(loadStaffRoles).mockResolvedValue(roles);
}

beforeEach(() => {
  vi.resetAllMocks();
  signIn(["commercial"]);
  vi.mocked(addPayment).mockResolvedValue("added");
  vi.mocked(voidPayment).mockResolvedValue({ bookingId: BOOKING_ID });
});

const actions: {
  name: string;
  action: (prev: BookingActionState, data: FormData) => Promise<BookingActionState>;
  service: typeof addPayment | typeof voidPayment;
  values: Record<string, string>;
  invalid: Record<string, string>;
  message: string;
}[] = [
  { name: "registrar", action: addPaymentAction, service: addPayment, values: ADD, invalid: { amountUsd: "300.50" }, message: "Pago registrado." },
  { name: "anular", action: voidPaymentAction, service: voidPayment, values: VOID, invalid: { paymentId: "abc" }, message: "Pago anulado." },
];

describe.each(actions)("$name: permisos en llamadas directas", ({ action, service, values, invalid, message }) => {
  it("rechaza sin sesión antes de consultar o mutar", async () => {
    auth.mockResolvedValue({ userId: null });
    expect(await action(IDLE, form(values))).toEqual({
      status: "error", code: "unauthorized", message: "Tu sesión no es válida. Vuelve a iniciar sesión.",
    });
    expect(acceptInvitationAndLoadStaffRoles).not.toHaveBeenCalled();
    expect(service).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rechaza una cuenta sin rol de staff (runner) aunque envíe roles falsificados", async () => {
    signIn([]);
    expect(await action(IDLE, form({ ...values, role: "admin" }))).toEqual({
      status: "error", code: "forbidden", message: "No tienes permiso para gestionar reservas.",
    });
    expect(service).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rechaza staff sin correo verificado", async () => {
    signIn(["admin"], false);
    expect(await action(IDLE, form(values))).toMatchObject({ code: "forbidden" });
    expect(service).not.toHaveBeenCalled();
  });

  it.each(["commercial", "admin"] as const)("permite %s y revalida la lista y la ficha", async (role) => {
    signIn([role]);
    expect(await action(IDLE, form(values))).toEqual({ status: "success", message });
    expect(service).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/crm/reservas");
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/reservas/${BOOKING_ID}`);
  });

  it("valida antes de mutar, conserva lo escrito y no devuelve claves ajenas", async () => {
    const result = await action(IDLE, form({ ...values, ...invalid, secret: "do-not-echo" }));
    expect(result).toMatchObject({
      status: "error", code: "invalid_input", message: "Revisa los campos marcados.", values: { ...values, ...invalid },
    });
    if (result.status === "error") {
      expect(Object.keys(result.fieldErrors ?? {})).toEqual(Object.keys(invalid));
      expect(result.values).not.toHaveProperty("secret");
    }
    expect(service).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("oculta errores de base de datos y su causa, sin console", async () => {
    const consoleSpies = (["error", "warn", "log", "info"] as const).map((method) => vi.spyOn(console, method));
    vi.mocked(service).mockRejectedValue(new Error("postgres://private-host password=secret"));
    const result = action(IDLE, form(values));
    await expect(result).rejects.toThrow(/^booking action failed$/);
    await expect(result).rejects.not.toHaveProperty("cause");
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("addPaymentAction", () => {
  it("registra con datos parseados y el actor de la sesión, ignorando campos del servidor", async () => {
    await addPaymentAction(IDLE, form({ ...ADD, ...SMUGGLED }));
    expect(addPayment).toHaveBeenCalledExactlyOnceWith(paymentFormSchema.parse(ADD), "staff-1");
    expect(vi.mocked(addPayment).mock.calls[0][0]).toEqual({
      bookingId: BOOKING_ID, amountUsd: 300, paidOn: "2027-03-03", concept: "Reserva",
    });
  });

  it.each(["0", "300.50", "-1", ""])("muestra el mensaje de USD enteros bajo el importe %j", async (amountUsd) => {
    const result = await addPaymentAction(IDLE, form({ ...ADD, amountUsd }));
    expect(result).toMatchObject({
      fieldErrors: { amountUsd: ["Indica el importe en dólares, sin decimales."] }, values: { ...ADD, amountUsd },
    });
    expect(addPayment).not.toHaveBeenCalled();
  });

  it("devuelve not_found para una reserva cancelada o inexistente y conserva lo escrito", async () => {
    vi.mocked(addPayment).mockResolvedValue("not_found");
    expect(await addPaymentAction(IDLE, form(ADD))).toEqual({
      status: "error", code: "not_found", message: NOT_FOUND, values: ADD,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("voidPaymentAction", () => {
  it("anula con el actor de la sesión, ignorando voidedBy", async () => {
    await voidPaymentAction(IDLE, form({ ...VOID, ...SMUGGLED }));
    expect(voidPayment).toHaveBeenCalledExactlyOnceWith(PAYMENT_ID, "staff-1");
  });

  it("devuelve not_found para un pago ya anulado o de una reserva cancelada", async () => {
    vi.mocked(voidPayment).mockResolvedValue("not_found");
    expect(await voidPaymentAction(IDLE, form(VOID))).toEqual({
      status: "error", code: "not_found", message: NOT_FOUND,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
