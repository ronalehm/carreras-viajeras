// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ getSession }) }));
vi.mock("@/lib/auth/access.service", () => ({
  acceptInvitationAndLoadStaffRoles: vi.fn(), loadStaffRoles: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));
vi.mock("../services/itinerary.service", () => ({
  createItineraryItem: vi.fn(), updateItineraryItem: vi.fn(), deleteItineraryItem: vi.fn(),
  createTripUpdate: vi.fn(), deleteTripUpdate: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptInvitationAndLoadStaffRoles, loadStaffRoles } from "@/lib/auth/access.service";
import {
  createItineraryItem,
  createTripUpdate,
  deleteItineraryItem,
  deleteTripUpdate,
  updateItineraryItem,
} from "../services/itinerary.service";
import type { BookingActionState } from "../types/bookings.types";
import {
  createItineraryItemAction,
  createTripUpdateAction,
  deleteItineraryItemAction,
  deleteTripUpdateAction,
  updateItineraryItemAction,
} from "./itinerary.actions";

const TRIP_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const OTHER_TRIP_ID = "99999999-9999-4999-8999-999999999999";
const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "44444444-4444-4444-8444-444444444444";
const UPDATE_ID = "55555555-5555-4555-8555-555555555555";
const TRIP_PAGE = `/crm/viajes/${TRIP_ID}/itinerario`;
const BOOKING_PAGE = `/crm/reservas/${BOOKING_ID}`;
const IDLE = { status: "idle" } as const;
const NOT_FOUND = "El elemento ya no existe. Recarga la página.";

const ITEM_FIELDS = {
  kind: "flight", status: "confirmed", title: "LA 2370", details: "", location: "",
  startDate: "2027-05-14", startTime: "01:30", startTimeZone: "America/Lima",
  endDate: "2027-05-14", endTime: "06:55", endTimeZone: "America/Santiago", runnerVisible: "on",
};
const CREATE = { tripId: TRIP_ID, ...ITEM_FIELDS };
const UPDATE = { itemId: ITEM_ID, ...ITEM_FIELDS };
const PUBLISH = { tripId: TRIP_ID, title: "Recojo de kits", body: "Sábado a las 10:00." };

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
function signIn(roles: ("commercial" | "admin")[], emailVerified = true) {
  getSession.mockResolvedValue({ data: { user: { id: "staff-1", email: "agent@example.com", emailVerified } }, error: null });
  vi.mocked(acceptInvitationAndLoadStaffRoles).mockResolvedValue(roles);
  vi.mocked(loadStaffRoles).mockResolvedValue(roles);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(redirect).mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
  signIn(["commercial"]);
  vi.mocked(createItineraryItem).mockResolvedValue({ id: ITEM_ID, tripId: TRIP_ID, bookingId: null });
  vi.mocked(updateItineraryItem).mockResolvedValue({ tripId: TRIP_ID, bookingId: null });
  vi.mocked(deleteItineraryItem).mockResolvedValue({ tripId: TRIP_ID, bookingId: null });
  vi.mocked(createTripUpdate).mockResolvedValue("created");
  vi.mocked(deleteTripUpdate).mockResolvedValue({ tripId: TRIP_ID });
});

type Service = typeof createItineraryItem | typeof updateItineraryItem | typeof deleteItineraryItem
  | typeof createTripUpdate | typeof deleteTripUpdate;
const actions: {
  name: string;
  action: (prev: BookingActionState, data: FormData) => Promise<BookingActionState>;
  service: Service;
  values: Record<string, string>;
  invalid: Record<string, string>;
  message: string;
  revalidated: string[];
  redirects: boolean;
}[] = [
  { name: "añadir hito", action: createItineraryItemAction, service: createItineraryItem, values: CREATE, invalid: { startTimeZone: "Mars/Base" }, message: "Hito añadido.", revalidated: [TRIP_PAGE], redirects: false },
  { name: "editar hito", action: updateItineraryItemAction, service: updateItineraryItem, values: UPDATE, invalid: { endDate: "2027-05-13" }, message: "Hito actualizado.", revalidated: [TRIP_PAGE, `/crm/itinerario/${ITEM_ID}`], redirects: true },
  { name: "eliminar hito", action: deleteItineraryItemAction, service: deleteItineraryItem, values: { itemId: ITEM_ID }, invalid: { itemId: "abc" }, message: "Hito eliminado.", revalidated: [TRIP_PAGE], redirects: false },
  { name: "publicar aviso", action: createTripUpdateAction, service: createTripUpdate, values: PUBLISH, invalid: { body: "x".repeat(2001) }, message: "Aviso publicado.", revalidated: [TRIP_PAGE], redirects: false },
  { name: "eliminar aviso", action: deleteTripUpdateAction, service: deleteTripUpdate, values: { updateId: UPDATE_ID }, invalid: { updateId: "abc" }, message: "Aviso eliminado.", revalidated: [TRIP_PAGE], redirects: false },
];

describe.each(actions)("$name: permisos en llamadas directas", (
  { action, service, values, invalid, message, revalidated, redirects },
) => {
  it("rechaza sin sesión antes de consultar o mutar", async () => {
    getSession.mockResolvedValue({ data: null, error: null });
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

  it.each(["commercial", "admin"] as const)("permite %s y revalida la página de origen", async (role) => {
    signIn([role]);
    const result = action(IDLE, form(values));
    if (redirects) await expect(result).rejects.toThrow("NEXT_REDIRECT");
    else await expect(result).resolves.toEqual({ status: "success", message });
    expect(service).toHaveBeenCalledOnce();
    expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual(revalidated);
    if (redirects) expect(redirect).toHaveBeenCalledExactlyOnceWith(TRIP_PAGE);
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

  it("devuelve not_found sin revalidar", async () => {
    vi.mocked(service).mockResolvedValue("not_found");
    expect(await action(IDLE, form(values))).toMatchObject({ status: "error", code: "not_found", message: NOT_FOUND });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("createItineraryItemAction", () => {
  it("un hito de reserva ignora el tripId del formulario y revalida la ficha", async () => {
    vi.mocked(createItineraryItem).mockResolvedValue({ id: ITEM_ID, tripId: TRIP_ID, bookingId: BOOKING_ID });
    await createItineraryItemAction(IDLE, form({ ...ITEM_FIELDS, bookingId: BOOKING_ID, tripId: OTHER_TRIP_ID }));
    expect(vi.mocked(createItineraryItem).mock.calls[0][0]).toMatchObject({ bookingId: BOOKING_ID, tripId: null });
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith(BOOKING_PAGE);
  });

  it("pasa los valores parseados, con la visibilidad del checkbox", async () => {
    await createItineraryItemAction(IDLE, form(CREATE));
    expect(vi.mocked(createItineraryItem).mock.calls[0][0]).toEqual({
      tripId: TRIP_ID, bookingId: null, kind: "flight", status: "confirmed", title: "LA 2370", details: null, location: null,
      startDate: "2027-05-14", startTime: "01:30", startTimeZone: "America/Lima",
      endDate: "2027-05-14", endTime: "06:55", endTimeZone: "America/Santiago", runnerVisible: true,
    });
    const hidden = form(CREATE);
    hidden.delete("runnerVisible");
    await createItineraryItemAction(IDLE, hidden);
    expect(vi.mocked(createItineraryItem).mock.calls[1][0]).toMatchObject({ runnerVisible: false });
  });

  it.each([
    ["hora sin fecha", { startDate: "", endDate: "", endTime: "", endTimeZone: "" }, "startDate", "Indica la fecha."],
    ["hora sin zona", { startTimeZone: "" }, "startTimeZone", "Indica la zona horaria."],
    ["fin anterior al inicio", { endDate: "2027-05-13" }, "endDate", "El fin no puede ser anterior al inicio."],
  ])("muestra %s bajo su campo y conserva lo escrito", async (_case, overrides, field, error) => {
    const result = await createItineraryItemAction(IDLE, form({ ...CREATE, ...overrides }));
    expect(result).toMatchObject({ fieldErrors: { [field]: [error] }, values: { ...CREATE, ...overrides } });
    expect(createItineraryItem).not.toHaveBeenCalled();
  });
});

describe("updateItineraryItemAction", () => {
  it("vuelve a la ficha de la reserva para un hito de reserva, sin mover el hito", async () => {
    vi.mocked(updateItineraryItem).mockResolvedValue({ tripId: TRIP_ID, bookingId: BOOKING_ID });
    await expect(updateItineraryItemAction(IDLE, form({ ...UPDATE, status: "completed", tripId: OTHER_TRIP_ID, bookingId: BOOKING_ID })))
      .rejects.toThrow("NEXT_REDIRECT");
    const input = vi.mocked(updateItineraryItem).mock.calls[0][0];
    expect(input).toMatchObject({ itemId: ITEM_ID, status: "completed" });
    expect(input).not.toHaveProperty("tripId");
    expect(input).not.toHaveProperty("bookingId");
    expect(redirect).toHaveBeenCalledExactlyOnceWith(BOOKING_PAGE);
  });
});

describe("createTripUpdateAction", () => {
  it("publica con el actor de la sesión, ignorando createdBy", async () => {
    await createTripUpdateAction(IDLE, form({ ...PUBLISH, createdBy: "user-x" }));
    expect(createTripUpdate).toHaveBeenCalledExactlyOnceWith(PUBLISH, "staff-1");
  });

  it("exige título", async () => {
    expect(await createTripUpdateAction(IDLE, form({ ...PUBLISH, title: "" })))
      .toMatchObject({ fieldErrors: { title: ["El título debe tener entre 3 y 120 caracteres."] } });
  });
});
