// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { auth, currentUser } = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));
vi.mock("@/lib/auth/access.service", () => ({
  acceptInvitationAndLoadStaffRoles: vi.fn(), loadStaffRoles: vi.fn(),
}));
vi.mock("./rewardReconciliation", () => ({ reconcileBookingAfterCommit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));
vi.mock("../services/bookings.service", () => ({
  createBooking: vi.fn(), updateBooking: vi.fn(), setBookingStatus: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptInvitationAndLoadStaffRoles, loadStaffRoles } from "@/lib/auth/access.service";
import { bookingFormSchema, updateBookingSchema } from "../schemas/bookings.schema";
import { createBooking, setBookingStatus, updateBooking } from "../services/bookings.service";
import type { BookingActionState } from "../types/bookings.types";
import { changeBookingStatusAction, createBookingAction, updateBookingAction } from "./bookings.actions";

const TRIP_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "22222222-2222-4222-8222-222222222222";
const IDLE = { status: "idle" } as const;
const FIELDS = {
  participantName: "Ana Pérez", participantEmail: "  Ana@Example.com ", packageLabel: "Paquete corredor",
  distance: "42K", totalUsd: "1499", balanceDueOn: "", internalNote: "",
};
const CREATE = { tripId: TRIP_ID, ...FIELDS };
const UPDATE = { bookingId: BOOKING_ID, ...FIELDS };
const STATUS = { bookingId: BOOKING_ID, status: "confirmed" };
// Keys a client could add to try to set server-owned columns.
const SMUGGLED = { runnerUserId: "user-x", status: "confirmed", createdBy: "user-y" };

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
  vi.mocked(acceptInvitationAndLoadStaffRoles).mockResolvedValue({ staffRoles: roles, blocked: false });
  vi.mocked(loadStaffRoles).mockResolvedValue({ staffRoles: roles, blocked: false });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(redirect).mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
  signIn(["commercial"]);
  vi.mocked(createBooking).mockResolvedValue({ id: BOOKING_ID });
  vi.mocked(updateBooking).mockResolvedValue("updated");
  vi.mocked(setBookingStatus).mockResolvedValue("changed");
});

const actions: {
  name: string;
  action: (prev: BookingActionState, data: FormData) => Promise<BookingActionState>;
  service: typeof createBooking | typeof updateBooking | typeof setBookingStatus;
  values: Record<string, string>;
  invalid: Record<string, string>;
  redirects: boolean;
  revalidatesLeads: boolean;
}[] = [
  { name: "crear", action: createBookingAction, service: createBooking, values: CREATE, invalid: { totalUsd: "1499.50" }, redirects: true, revalidatesLeads: false },
  { name: "editar", action: updateBookingAction, service: updateBooking, values: UPDATE, invalid: { totalUsd: "1499.50" }, redirects: false, revalidatesLeads: false },
  { name: "cambiar estado", action: changeBookingStatusAction, service: setBookingStatus, values: STATUS, invalid: { status: "pending" }, redirects: false, revalidatesLeads: true },
];

describe.each(actions)("$name: permisos en llamadas directas", ({ action, service, values, invalid, redirects, revalidatesLeads }) => {
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
    const result = action(IDLE, form(values));
    if (redirects) await expect(result).rejects.toThrow("NEXT_REDIRECT");
    else await expect(result).resolves.toMatchObject({ status: "success" });
    expect(service).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledTimes(revalidatesLeads ? 4 : 2);
    expect(revalidatePath).toHaveBeenCalledWith("/crm/reservas");
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/reservas/${BOOKING_ID}`);
    if (redirects) expect(redirect).toHaveBeenCalledExactlyOnceWith(`/crm/reservas/${BOOKING_ID}`);
    else expect(redirect).not.toHaveBeenCalled();
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
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("createBookingAction", () => {
  it("crea con datos parseados y el actor de la sesión, ignorando campos del servidor", async () => {
    await expect(createBookingAction(IDLE, form({ ...CREATE, ...SMUGGLED }))).rejects.toThrow("NEXT_REDIRECT");
    expect(createBooking).toHaveBeenCalledExactlyOnceWith(bookingFormSchema.parse(CREATE), "staff-1");
    expect(vi.mocked(createBooking).mock.calls[0][0]).toMatchObject({ participantEmail: "ana@example.com", totalUsd: 1499 });
  });

  it.each([
    ["duplicate", "participantEmail", "Ese correo ya tiene una reserva activa en este viaje."],
    ["invalid_trip", "tripId", "Ese viaje ya no está disponible."],
  ] as const)("devuelve %s bajo su campo, conserva lo escrito y no redirige", async (code, field, message) => {
    vi.mocked(createBooking).mockResolvedValue(code);
    expect(await createBookingAction(IDLE, form(CREATE))).toEqual({
      status: "error", code, message, fieldErrors: { [field]: [message] }, values: CREATE,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("vincula el lead del campo oculto y revalida también su ficha", async () => {
    await expect(createBookingAction(IDLE, form({ ...CREATE, leadId: LEAD_ID }))).rejects.toThrow("NEXT_REDIRECT");
    expect(createBooking).toHaveBeenCalledExactlyOnceWith(
      bookingFormSchema.parse({ ...CREATE, leadId: LEAD_ID }), "staff-1",
    );
    expect(vi.mocked(createBooking).mock.calls[0][0].leadId).toBe(LEAD_ID);
    expect(revalidatePath).toHaveBeenCalledTimes(3);
    expect(revalidatePath).toHaveBeenCalledWith(`/crm/leads/${LEAD_ID}`);
  });

  it.each([["", null], [undefined, null]])("crea sin vínculo con leadId %j", async (leadId, expected) => {
    const values = leadId === undefined ? CREATE : { ...CREATE, leadId };
    await expect(createBookingAction(IDLE, form(values))).rejects.toThrow("NEXT_REDIRECT");
    expect(vi.mocked(createBooking).mock.calls[0][0].leadId).toBe(expected);
    expect(revalidatePath).not.toHaveBeenCalledWith(expect.stringMatching(/^\/crm\/leads/));
  });

  it("rechaza un leadId que no es UUID sin llamar al service", async () => {
    const result = await createBookingAction(IDLE, form({ ...CREATE, leadId: "abc" }));
    expect(result).toMatchObject({ status: "error", code: "invalid_input", fieldErrors: { leadId: ["El lead indicado no es válido."] } });
    expect(createBooking).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_lead", "El lead ya no existe o está archivado. Crea la reserva sin vincular o recarga la página."],
    ["lead_taken", "Ese lead ya tiene una reserva activa."],
  ] as const)("devuelve %s con su mensaje, conserva lo escrito y no redirige", async (code, message) => {
    vi.mocked(createBooking).mockResolvedValue(code);
    const values = { ...CREATE, leadId: LEAD_ID };
    expect(await createBookingAction(IDLE, form(values))).toEqual({ status: "error", code, message, values });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("muestra el mensaje de USD enteros bajo el total", async () => {
    for (const totalUsd of ["1499.50", "-1", "abc"]) {
      const result = await createBookingAction(IDLE, form({ ...CREATE, totalUsd }));
      expect(result).toMatchObject({ fieldErrors: { totalUsd: ["Indica el total en dólares, sin decimales."] } });
    }
  });
});

describe("updateBookingAction", () => {
  it("edita con datos parseados, sin viaje ni campos del servidor", async () => {
    expect(await updateBookingAction(IDLE, form({ ...UPDATE, ...SMUGGLED, tripId: TRIP_ID }))).toEqual({
      status: "success", message: "Reserva actualizada.",
    });
    expect(updateBooking).toHaveBeenCalledExactlyOnceWith(updateBookingSchema.parse(UPDATE));
    expect(vi.mocked(updateBooking).mock.calls[0][0]).not.toHaveProperty("tripId");
  });

  it.each([
    ["email_locked", "email_locked", "La cuenta ya está vinculada; el correo no se puede cambiar.", "participantEmail"],
    ["duplicate", "duplicate", "Ese correo ya tiene una reserva activa en este viaje.", "participantEmail"],
    ["not_found", "not_found", "La reserva ya no existe o está cancelada. Recarga la página.", undefined],
    ["cancelled", "not_found", "La reserva ya no existe o está cancelada. Recarga la página.", undefined],
  ] as const)("mapea %s a %s y conserva el formulario", async (result, code, message, field) => {
    vi.mocked(updateBooking).mockResolvedValue(result);
    expect(await updateBookingAction(IDLE, form(UPDATE))).toEqual({
      status: "error", code, message, values: UPDATE,
      ...(field && { fieldErrors: { [field]: [message] } }),
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("changeBookingStatusAction", () => {
  it.each([
    ["confirmed", "Reserva confirmada."],
    ["cancelled", "Reserva cancelada."],
  ] as const)("cambia a %s", async (status, message) => {
    expect(await changeBookingStatusAction(IDLE, form({ bookingId: BOOKING_ID, status }))).toEqual({ status: "success", message });
    expect(setBookingStatus).toHaveBeenCalledExactlyOnceWith(BOOKING_ID, status, "staff-1");
  });

  it("pasa siempre el actor de la sesión, aunque el formulario traiga otro", async () => {
    await changeBookingStatusAction(IDLE, form({ ...STATUS, actorUserId: "user-x", createdBy: "user-y" }));
    expect(setBookingStatus).toHaveBeenCalledExactlyOnceWith(BOOKING_ID, "confirmed", "staff-1");
  });

  it("revalida la lista de leads y todas las fichas (el vínculo lo conoce solo la base)", async () => {
    await changeBookingStatusAction(IDLE, form(STATUS));
    expect(revalidatePath).toHaveBeenCalledWith("/crm/leads");
    expect(revalidatePath).toHaveBeenCalledWith("/crm/(protected)/leads/[id]", "page");
  });

  it("rechaza una transición no permitida sin revalidar", async () => {
    vi.mocked(setBookingStatus).mockResolvedValue("invalid_transition");
    expect(await changeBookingStatusAction(IDLE, form(STATUS))).toEqual({
      status: "error", code: "invalid_transition", message: "La reserva ya no está en ese estado. Recarga la página.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
