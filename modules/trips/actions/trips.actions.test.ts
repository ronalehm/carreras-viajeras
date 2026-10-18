// @vitest-environment node
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../services/trips.service", () => ({
  createTrip: vi.fn(),
  updateTrip: vi.fn(),
  setTripStatus: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/guards";
import { createTrip, setTripStatus, updateTrip } from "../services/trips.service";
import type { TripActionState } from "../types/trips.types";
import { changeTripStatusAction, createTripAction, updateTripAction } from "./trips.actions";

const guard = vi.mocked(requirePermission);
const revalidate = vi.mocked(revalidatePath);
const navigate = vi.mocked(redirect);
const services = {
  createTrip: vi.mocked(createTrip),
  updateTrip: vi.mocked(updateTrip),
  setTripStatus: vi.mocked(setTripStatus),
};

const IDLE: TripActionState = { status: "idle" };
const TRIP_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";

const validTrip = {
  title: "Maratón de Santiago 2027",
  slug: "maraton-santiago-2027",
  city: "Santiago",
  country: "Chile",
  raceDate: "2027-04-25",
  startDate: "2027-04-23",
  endDate: "2027-04-27",
  distances: "42K, 21K, 10K",
  summary: "Viaje grupal para correr la Maratón de Santiago.",
  includes: "Hotel 4 noches\nTraslados",
  priceUsd: "1990",
  capacity: "100",
  imageUrl: "",
};

const parsedTrip = {
  title: "Maratón de Santiago 2027",
  slug: "maraton-santiago-2027",
  city: "Santiago",
  country: "Chile",
  raceDate: "2027-04-25",
  startDate: "2027-04-23",
  endDate: "2027-04-27",
  distances: ["42K", "21K", "10K"],
  summary: "Viaje grupal para correr la Maratón de Santiago.",
  includes: ["Hotel 4 noches", "Traslados"],
  priceUsd: 1990,
  capacity: 100,
  imageUrl: null,
};

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.append(key, value);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  guard.mockResolvedValue({ id: "user-1", email: "ana@example.com", emailVerified: true, staffRoles: ["commercial"] });
  services.createTrip.mockResolvedValue({ id: TRIP_ID });
  services.updateTrip.mockResolvedValue("updated");
  services.setTripStatus.mockResolvedValue("changed");
});

type ActionCase = {
  name: string;
  action: (prev: TripActionState, formData: FormData) => Promise<TripActionState>;
  service: MockInstance;
  valid: Record<string, string>;
};

const actions: ActionCase[] = [
  { name: "createTripAction", action: createTripAction, service: services.createTrip, valid: validTrip },
  {
    name: "updateTripAction",
    action: updateTripAction,
    service: services.updateTrip,
    valid: { ...validTrip, id: TRIP_ID },
  },
  {
    name: "changeTripStatusAction",
    action: changeTripStatusAction,
    service: services.setTripStatus,
    valid: { id: TRIP_ID, status: "published" },
  },
];

describe.each(actions)("$name called directly", ({ action, service, valid }) => {
  it("checks trips.manage", async () => {
    await action(IDLE, form(valid));
    expect(guard).toHaveBeenCalledExactlyOnceWith("trips.manage");
  });

  it("returns unauthorized without a session and does not call the service", async () => {
    guard.mockRejectedValue(new UnauthorizedError());

    await expect(action(IDLE, form(valid))).resolves.toEqual({
      status: "error",
      code: "unauthorized",
      message: "Tu sesión no es válida. Vuelve a iniciar sesión.",
    });
    expect(service).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("returns forbidden without trips.manage (e.g. an account without a staff role)", async () => {
    guard.mockRejectedValue(new ForbiddenError());

    await expect(action(IDLE, form(valid))).resolves.toEqual({
      status: "error",
      code: "forbidden",
      message: "No tienes permiso para gestionar viajes.",
    });
    expect(service).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("returns invalid_input with field errors for an empty form, without calling the service", async () => {
    const state = await action(IDLE, form({}));

    expect(state).toMatchObject({ status: "error", code: "invalid_input", message: "Revisa los campos marcados." });
    expect(state.status === "error" && Object.keys(state.fieldErrors ?? {}).length).toBeGreaterThan(0);
    expect(service).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("rethrows service failures without the original message", async () => {
    service.mockRejectedValue(new Error('duplicate key value violates unique constraint "trips_slug_uq"'));

    const error = await action(IDLE, form(valid)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("trip action failed");
    expect((error as Error).cause).toBeUndefined();
    expect(revalidate).not.toHaveBeenCalled();
  });
});

describe("createTripAction", () => {
  it("creates the parsed trip without status or createdAt, revalidates and redirects", async () => {
    await createTripAction(IDLE, form({ ...validTrip, status: "published", createdAt: "2020-01-01" }));

    expect(services.createTrip).toHaveBeenCalledExactlyOnceWith(parsedTrip);
    expect(revalidate).toHaveBeenCalledExactlyOnceWith("/crm/viajes");
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/crm/viajes");
  });

  it("returns the field errors and what was typed for invalid data", async () => {
    const state = await createTripAction(
      IDLE,
      form({ ...validTrip, title: "ab", distances: " , ", priceUsd: "12.5", status: "published" }),
    );

    expect(state).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los campos marcados.",
      fieldErrors: {
        title: ["El título debe tener entre 3 y 120 caracteres."],
        distances: ["Indica al menos una distancia."],
        priceUsd: ["Indica un precio en dólares, sin decimales."],
      },
      values: { ...validTrip, title: "ab", distances: " , ", priceUsd: "12.5" },
    });
    expect(services.createTrip).not.toHaveBeenCalled();
  });

  it("maps slug_taken to an error on slug without revalidating", async () => {
    services.createTrip.mockResolvedValue("slug_taken");

    const state = await createTripAction(IDLE, form(validTrip));

    expect(state).toMatchObject({
      status: "error",
      code: "slug_taken",
      fieldErrors: { slug: ["Ese identificador ya está en uso."] },
      values: validTrip,
    });
    expect(revalidate).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("updateTripAction", () => {
  it("updates the trip by id with the parsed input, revalidates and redirects", async () => {
    await updateTripAction(IDLE, form({ ...validTrip, id: TRIP_ID, status: "archived" }));

    expect(services.updateTrip).toHaveBeenCalledExactlyOnceWith(TRIP_ID, parsedTrip);
    expect(revalidate).toHaveBeenCalledExactlyOnceWith("/crm/viajes");
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/crm/viajes");
  });

  it("rejects an id that is not a UUID as invalid_input", async () => {
    await expect(updateTripAction(IDLE, form({ ...validTrip, id: "abc" }))).resolves.toMatchObject({
      status: "error",
      code: "invalid_input",
      fieldErrors: { id: ["El viaje no es válido."] },
    });
    expect(services.updateTrip).not.toHaveBeenCalled();
  });

  it.each([
    ["slug_taken", { fieldErrors: { slug: ["Ese identificador ya está en uso."] } }],
    ["slug_locked", { fieldErrors: { slug: ["Solo se puede cambiar en borrador."] } }],
    ["not_found", { message: "El viaje ya no existe. Recarga la página." }],
    ["archived", { message: "Este viaje está archivado y no se puede editar." }],
  ] as const)("maps %s to its error, keeping what was typed", async (result, expected) => {
    services.updateTrip.mockResolvedValue(result);

    const state = await updateTripAction(IDLE, form({ ...validTrip, id: TRIP_ID }));

    expect(state).toMatchObject({ status: "error", code: result, values: validTrip, ...expected });
    expect(revalidate).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("changeTripStatusAction", () => {
  it.each([
    ["published", "Viaje publicado. Ya aparece en la web."],
    ["draft", "Viaje despublicado. Ya no aparece en la web."],
    ["archived", "Viaje archivado."],
  ] as const)("changes the status to %s, revalidates and confirms", async (status, message) => {
    const state = await changeTripStatusAction(IDLE, form({ id: TRIP_ID, status, title: "ignored" }));

    expect(services.setTripStatus).toHaveBeenCalledExactlyOnceWith(TRIP_ID, status);
    expect(revalidate).toHaveBeenCalledExactlyOnceWith("/crm/viajes");
    expect(navigate).not.toHaveBeenCalled();
    expect(state).toEqual({ status: "success", message });
  });

  it("maps invalid_transition to its error without revalidating", async () => {
    services.setTripStatus.mockResolvedValue("invalid_transition");

    await expect(changeTripStatusAction(IDLE, form({ id: TRIP_ID, status: "published" }))).resolves.toEqual({
      status: "error",
      code: "invalid_transition",
      message: "El viaje ya no está en ese estado. Recarga la página.",
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it.each([
    [{ id: "abc", status: "published" }, "id"],
    [{ id: TRIP_ID, status: "deleted" }, "status"],
  ])("rejects %o as invalid_input on %s", async (fields, field) => {
    const state = await changeTripStatusAction(IDLE, form(fields));

    expect(state).toMatchObject({ status: "error", code: "invalid_input" });
    expect(state.status === "error" && Object.keys(state.fieldErrors ?? {})).toEqual([field]);
    expect(services.setTripStatus).not.toHaveBeenCalled();
  });
});
