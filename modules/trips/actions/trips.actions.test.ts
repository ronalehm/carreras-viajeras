// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { auth, currentUser } = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));
vi.mock("@/lib/auth/access.service", () => ({
  acceptInvitationAndLoadStaffRoles: vi.fn(), loadStaffRoles: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));
vi.mock("../services/trips.service", () => ({ createTrip: vi.fn(), updateTrip: vi.fn(), setTripStatus: vi.fn() }));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptInvitationAndLoadStaffRoles, loadStaffRoles } from "@/lib/auth/access.service";
import type { StaffRole } from "@/lib/auth/permissions";
import { createTrip, setTripStatus, updateTrip } from "../services/trips.service";
import { tripFormSchema } from "../schemas/trips.schema";
import type { TripActionState, TripScope } from "../types/trips.types";
import { createTripAction, updateTripAction, changeTripStatusAction } from "./trips.actions";

const ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const IDLE = { status: "idle" } as const;
const VALID = {
  title: " Maratón Santiago 2027 ", slug: "maraton-santiago-2027", city: "Santiago", country: "Chile",
  raceDate: "2027-04-25", startDate: "2027-04-23", endDate: "2027-04-27",
  distances: "42K, 21K", summary: "Un viaje para correr en Santiago.", includes: "Hotel\nTraslados",
  capacity: "100", imageUrl: "",
};
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
const ALL: TripScope = { kind: "all" };
function signIn(roles: StaffRole[], emailVerified = true, userId = "staff-1") {
  auth.mockResolvedValue({ userId });
  currentUser.mockResolvedValue({
    id: userId,
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
  vi.mocked(createTrip).mockResolvedValue({ id: ID });
  vi.mocked(updateTrip).mockResolvedValue("updated");
  vi.mocked(setTripStatus).mockResolvedValue("changed");
});

const actions: {
  name: string;
  action: (prev: TripActionState, data: FormData) => Promise<TripActionState>;
  service: typeof createTrip | typeof updateTrip | typeof setTripStatus;
  values: Record<string, string>;
  redirects: boolean;
}[] = [
  { name: "crear", action: createTripAction, service: createTrip, values: VALID, redirects: true },
  { name: "editar", action: updateTripAction, service: updateTrip, values: { ...VALID, id: ID }, redirects: true },
  { name: "cambiar estado", action: changeTripStatusAction, service: setTripStatus, values: { id: ID, status: "published" }, redirects: false },
];

describe.each(actions)("$name: permisos en llamadas directas", ({ action, service, values, redirects }) => {
  it("rechaza sin sesión antes de consultar o mutar", async () => {
    auth.mockResolvedValue({ userId: null });
    expect(await action(IDLE, form(values))).toMatchObject({ status: "error", code: "unauthorized" });
    expect(acceptInvitationAndLoadStaffRoles).not.toHaveBeenCalled();
    expect(service).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("rechaza al runner aunque envíe roles falsificados", async () => {
    signIn([]);
    expect(await action(IDLE, form({ ...values, role: "admin" }))).toMatchObject({ status: "error", code: "forbidden" });
    expect(service).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("rechaza staff sin correo verificado", async () => {
    signIn(["admin"], false);
    expect(await action(IDLE, form(values))).toMatchObject({ code: "forbidden" });
    expect(service).not.toHaveBeenCalled();
  });
  it.each(["commercial", "admin", "super_admin", "organizer"] as const)("permite %s y revalida solo el CRM", async (role) => {
    signIn([role]);
    const result = action(IDLE, form(values));
    if (redirects) await expect(result).rejects.toThrow("NEXT_REDIRECT");
    else await expect(result).resolves.toMatchObject({ status: "success" });
    expect(service).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/crm/viajes");
    if (redirects) expect(redirect).toHaveBeenCalledWith("/crm/viajes");
  });
  it.each(["commercial", "admin", "super_admin"] as const)("pasa el alcance all a %s", async (role) => {
    signIn([role]);
    await action(IDLE, form(values)).catch(() => undefined);
    expect(vi.mocked(service).mock.calls[0]?.at(-1)).toEqual(ALL);
  });
  it("limita al organizer a sus viajes con su id de usuario", async () => {
    signIn(["organizer"], true, "organizer-7");
    await action(IDLE, form(values)).catch(() => undefined);
    expect(vi.mocked(service).mock.calls[0]?.at(-1)).toEqual({ kind: "own", organizerId: "organizer-7" });
  });
  it("ignora un organizerId enviado en el formulario", async () => {
    signIn(["organizer"], true, "organizer-7");
    await action(IDLE, form({ ...values, organizerId: "other-organizer" })).catch(() => undefined);
    expect(service).toHaveBeenCalledOnce();
    expect(vi.mocked(service).mock.calls[0]?.at(-1)).toEqual({ kind: "own", organizerId: "organizer-7" });
    expect(JSON.stringify(vi.mocked(service).mock.calls)).not.toContain("other-organizer");
  });
  it("valida antes de mutar y no devuelve campos desconocidos", async () => {
    const result = await action(IDLE, form({ ...values, title: "ab", id: "abc", status: "invalid", secret: "do-not-echo" }));
    expect(result).toMatchObject({ status: "error", code: "invalid_input" });
    expect(service).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    if (result.status === "error") {
      expect(result.fieldErrors).toBeTruthy();
      expect(result.values).not.toHaveProperty("secret");
    }
  });
  it("oculta errores de base de datos y su causa", async () => {
    vi.mocked(service).mockRejectedValue(new Error("postgres://private-host password=secret"));
    const result = action(IDLE, form(values));
    await expect(result).rejects.toThrow("trip action failed");
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

it("crea con datos parseados, sin estado ni fechas suministradas por el cliente", async () => {
  await expect(createTripAction(IDLE, form({ ...VALID, status: "published", createdAt: "fake" }))).rejects.toThrow("NEXT_REDIRECT");
  expect(createTrip).toHaveBeenCalledExactlyOnceWith(tripFormSchema.parse(VALID), ALL);
});

it("preserva los strings escritos ante validación y omite archivos y claves ajenas", async () => {
  const data = form({ ...VALID, title: "ab", capacity: "12.5", status: "published", createdAt: "fake" });
  data.set("imageUrl", new File(["image"], "image.png"));
  const result = await createTripAction(IDLE, data);
  expect(result).toMatchObject({ code: "invalid_input", values: { title: "ab", capacity: "12.5", includes: "Hotel\nTraslados" } });
  if (result.status === "error") {
    expect(result.fieldErrors).toHaveProperty("title");
    expect(result.fieldErrors).toHaveProperty("capacity");
    expect(result.values).not.toHaveProperty("status");
    expect(result.values).not.toHaveProperty("createdAt");
    expect(result.values).not.toHaveProperty("imageUrl");
  }
});

it("devuelve slug duplicado en alta sin redirigir ni revalidar", async () => {
  vi.mocked(createTrip).mockResolvedValue("slug_taken");
  expect(await createTripAction(IDLE, form(VALID))).toMatchObject({
    code: "slug_taken", fieldErrors: { slug: ["Ese identificador ya está en uso."] }, values: VALID,
  });
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});

it("edita pasando el id separado de los campos editables", async () => {
  await expect(updateTripAction(IDLE, form({ ...VALID, id: ID, status: "archived" }))).rejects.toThrow("NEXT_REDIRECT");
  expect(updateTrip).toHaveBeenCalledExactlyOnceWith(ID, tripFormSchema.parse(VALID), ALL);
});

it.each([
  ["slug_taken", "Ese identificador ya está en uso."],
  ["slug_locked", "Solo se puede cambiar en borrador."],
  ["not_found", "El viaje ya no existe. Recarga la página."],
  ["archived", "Este viaje está archivado y no se puede editar."],
] as const)("edición: maneja %s y conserva el formulario", async (code, message) => {
  vi.mocked(updateTrip).mockResolvedValue(code);
  const result = await updateTripAction(IDLE, form({ ...VALID, id: ID }));
  expect(result).toMatchObject({ code, message, values: { ...VALID, id: ID } });
  if (result.status === "error" && code.startsWith("slug_")) {
    expect(result.fieldErrors).toEqual({ slug: [message] });
  }
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});

it.each([
  ["published", "Viaje publicado. Ya aparece en la web."],
  ["draft", "Viaje despublicado. Ya no aparece en la web."],
  ["archived", "Viaje archivado."],
] as const)("cambia a %s", async (status, message) => {
  expect(await changeTripStatusAction(IDLE, form({ id: ID, status }))).toEqual({ status: "success", message });
  expect(setTripStatus).toHaveBeenCalledExactlyOnceWith(ID, status, ALL);
  expect(redirect).not.toHaveBeenCalled();
});

it("rechaza una transición obsoleta sin revalidar", async () => {
  vi.mocked(setTripStatus).mockResolvedValue("invalid_transition");
  expect(await changeTripStatusAction(IDLE, form({ id: ID, status: "published" }))).toMatchObject({
    code: "invalid_transition", message: "El viaje ya no está en ese estado. Recarga la página.",
  });
  expect(revalidatePath).not.toHaveBeenCalled();
});

it("organizer: editar un viaje ajeno devuelve not_found sin revalidar", async () => {
  signIn(["organizer"], true, "organizer-7");
  vi.mocked(updateTrip).mockResolvedValue("not_found");
  expect(await updateTripAction(IDLE, form({ ...VALID, id: ID }))).toMatchObject({
    code: "not_found", message: "El viaje ya no existe. Recarga la página.",
  });
  expect(updateTrip).toHaveBeenCalledExactlyOnceWith(ID, tripFormSchema.parse(VALID), { kind: "own", organizerId: "organizer-7" });
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});

it.each(["published", "draft", "archived"] as const)(
  "organizer: cambiar a %s un viaje ajeno devuelve invalid_transition sin revalidar",
  async (status) => {
    signIn(["organizer"], true, "organizer-7");
    vi.mocked(setTripStatus).mockResolvedValue("invalid_transition");
    expect(await changeTripStatusAction(IDLE, form({ id: ID, status }))).toMatchObject({
      code: "invalid_transition", message: "El viaje ya no está en ese estado. Recarga la página.",
    });
    expect(setTripStatus).toHaveBeenCalledExactlyOnceWith(ID, status, { kind: "own", organizerId: "organizer-7" });
    expect(revalidatePath).not.toHaveBeenCalled();
  },
);

it.each([
  ["published", "Viaje publicado. Ya aparece en la web."],
  ["draft", "Viaje despublicado. Ya no aparece en la web."],
  ["archived", "Viaje archivado."],
] as const)("organizer: cambia su propio viaje a %s", async (status, message) => {
  signIn(["organizer"], true, "organizer-7");
  expect(await changeTripStatusAction(IDLE, form({ id: ID, status }))).toEqual({ status: "success", message });
  expect(setTripStatus).toHaveBeenCalledExactlyOnceWith(ID, status, { kind: "own", organizerId: "organizer-7" });
  expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/crm/viajes");
});
