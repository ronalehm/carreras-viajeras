// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { auth, currentUser } = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));
vi.mock("@/lib/auth/access.service", () => ({
  acceptInvitationAndLoadStaffRoles: vi.fn(), loadStaffRoles: vi.fn(), loadSponsorId: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));
vi.mock("../services/sponsors.service", () => ({ createSponsor: vi.fn(), updateSponsor: vi.fn() }));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptInvitationAndLoadStaffRoles, loadStaffRoles } from "@/lib/auth/access.service";
import type { StaffRole } from "@/lib/auth/permissions";
import { createSponsor, updateSponsor } from "../services/sponsors.service";
import type { SponsorActionState } from "../types/sponsors.types";
import { createSponsorAction, updateSponsorAction } from "./sponsors.actions";

const ID = "5b7f3c2e-1a4d-4e8f-9c0b-6d2a8e4f1b37";
const IDLE = { status: "idle" } as const;
const VALID = {
  name: " Marca Deportiva ", slug: "marca-deportiva", logoUrl: "https://example.com/logo.png",
  websiteUrl: "", description: "Ropa y calzado para corredores.",
};
const VALID_EDIT = {
  id: ID, name: VALID.name, logoUrl: VALID.logoUrl, websiteUrl: VALID.websiteUrl, description: VALID.description,
};
const PARSED = {
  name: "Marca Deportiva", logoUrl: "https://example.com/logo.png", websiteUrl: null,
  description: "Ropa y calzado para corredores.",
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
function signIn(roles: StaffRole[], emailVerified = true) {
  auth.mockResolvedValue({ userId: "admin-1" });
  currentUser.mockResolvedValue({
    id: "admin-1", primaryEmailAddressId: "primary",
    emailAddresses: [{
      id: "primary", emailAddress: "admin@example.com",
      verification: { status: emailVerified ? "verified" : "unverified" },
    }],
  });
  vi.mocked(acceptInvitationAndLoadStaffRoles).mockResolvedValue(roles);
  vi.mocked(loadStaffRoles).mockResolvedValue(roles);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(redirect).mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
  signIn(["admin"]);
  vi.mocked(createSponsor).mockResolvedValue({ id: ID });
  vi.mocked(updateSponsor).mockResolvedValue("updated");
});

const actions: {
  name: string;
  action: (prev: SponsorActionState, data: FormData) => Promise<SponsorActionState>;
  service: typeof createSponsor | typeof updateSponsor;
  values: Record<string, string>;
}[] = [
  { name: "crear", action: createSponsorAction, service: createSponsor, values: VALID },
  { name: "editar", action: updateSponsorAction, service: updateSponsor, values: VALID_EDIT },
];

describe.each(actions)("$name: permisos en llamadas directas", ({ action, service, values }) => {
  it("rechaza sin sesión antes de consultar o mutar", async () => {
    auth.mockResolvedValue({ userId: null });
    expect(await action(IDLE, form(values))).toMatchObject({
      status: "error", code: "unauthorized", message: "Tu sesión no es válida. Vuelve a iniciar sesión.",
    });
    expect(acceptInvitationAndLoadStaffRoles).not.toHaveBeenCalled();
    expect(service).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([[["commercial"]], [["organizer"]], [["sponsor"]], [[]]] as StaffRole[][][])(
    "rechaza los roles %j sin sponsors.manage",
    async (roles) => {
      signIn(roles);
      expect(await action(IDLE, form({ ...values, role: "admin" }))).toMatchObject({
        status: "error", code: "forbidden", message: "No tienes permiso para gestionar patrocinadores.",
      });
      expect(service).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("rechaza a un admin sin correo verificado", async () => {
    signIn(["admin"], false);
    expect(await action(IDLE, form(values))).toMatchObject({ code: "forbidden" });
    expect(service).not.toHaveBeenCalled();
  });

  it("valida antes de mutar, con errores por campo y sin devolver claves ajenas", async () => {
    const result = await action(IDLE, form({
      ...values, name: "a", slug: "Marca Deportiva", logoUrl: "http://example.com/logo.png",
      description: "x".repeat(501), secret: "do-not-echo",
    }));
    expect(result).toMatchObject({ status: "error", code: "invalid_input", message: "Revisa los campos marcados." });
    expect(service).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    if (result.status === "error") {
      // The form shows the first message of each field.
      expect(result.fieldErrors?.name?.[0]).toBe("El nombre debe tener entre 2 y 80 caracteres.");
      expect(result.fieldErrors?.logoUrl?.[0]).toBe("Indica una URL que empiece por https://.");
      expect(result.fieldErrors?.description?.[0]).toBe("La descripción debe tener entre 10 y 500 caracteres.");
      expect(result.values).toMatchObject({ name: "a", logoUrl: "http://example.com/logo.png" });
      expect(result.values).not.toHaveProperty("secret");
    }
  });

  it("oculta errores de base de datos y su causa", async () => {
    vi.mocked(service).mockRejectedValue(new Error("postgres://private-host password=secret"));
    const result = action(IDLE, form(values));
    await expect(result).rejects.toThrow("sponsor action failed");
    await expect(result).rejects.not.toHaveProperty("cause");
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("createSponsorAction", () => {
  it("crea con datos parseados y el actor de la sesión, revalida la lista y redirige a la marca", async () => {
    await expect(createSponsorAction(IDLE, form({ ...VALID, createdBy: "attacker", id: "fake" })))
      .rejects.toThrow("NEXT_REDIRECT");
    expect(createSponsor).toHaveBeenCalledExactlyOnceWith({ ...PARSED, slug: "marca-deportiva" }, "admin-1");
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/crm/admin/patrocinadores");
    expect(redirect).toHaveBeenCalledExactlyOnceWith(`/crm/admin/patrocinadores/${ID}`);
  });

  it("muestra un slug con mayúsculas y espacios bajo el campo y conserva lo escrito", async () => {
    const result = await createSponsorAction(IDLE, form({ ...VALID, slug: "Marca Deportiva" }));
    expect(result).toMatchObject({
      code: "invalid_input",
      fieldErrors: { slug: ["Usa minúsculas, números y guiones (p. ej. marca-deportiva)."] },
      values: { ...VALID, slug: "Marca Deportiva" },
    });
  });

  it("devuelve slug duplicado en el campo sin redirigir ni revalidar", async () => {
    vi.mocked(createSponsor).mockResolvedValue("slug_taken");
    expect(await createSponsorAction(IDLE, form(VALID))).toMatchObject({
      code: "slug_taken", message: "Ese identificador ya está en uso.",
      fieldErrors: { slug: ["Ese identificador ya está en uso."] }, values: VALID,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("updateSponsorAction", () => {
  it("ignora el slug y los campos extra, muestra el éxito y revalida la lista sin redirigir", async () => {
    expect(await updateSponsorAction(IDLE, form({ ...VALID_EDIT, slug: "otro-slug", createdBy: "attacker" })))
      .toEqual({ status: "success", message: "Patrocinador actualizado." });
    expect(updateSponsor).toHaveBeenCalledExactlyOnceWith(ID, PARSED);
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/crm/admin/patrocinadores");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("no devuelve el slug enviado entre los valores conservados", async () => {
    const result = await updateSponsorAction(IDLE, form({ ...VALID_EDIT, name: "a", slug: "otro-slug" }));
    expect(result.status === "error" && result.values).not.toHaveProperty("slug");
  });

  it("rechaza un id que no es UUID", async () => {
    expect(await updateSponsorAction(IDLE, form({ ...VALID_EDIT, id: "abc" }))).toMatchObject({
      code: "invalid_input", fieldErrors: { id: ["El patrocinador no es válido."] },
    });
    expect(updateSponsor).not.toHaveBeenCalled();
  });

  it("devuelve not_found y conserva el formulario sin revalidar", async () => {
    vi.mocked(updateSponsor).mockResolvedValue("not_found");
    expect(await updateSponsorAction(IDLE, form(VALID_EDIT))).toMatchObject({
      code: "not_found", message: "El patrocinador ya no existe. Recarga la página.", values: VALID_EDIT,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
