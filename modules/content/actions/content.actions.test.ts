// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));
vi.mock("../services/content.service", () => ({ createContentDraft: vi.fn(), saveContentDraft: vi.fn(), transitionContent: vi.fn() }));
import { requirePermission } from "@/lib/auth/guards";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/errors";
import { revalidatePath } from "next/cache";
import { createContentDraft, saveContentDraft, transitionContent } from "../services/content.service";
import { archiveContentAction, publishContentAction, saveContentAction, unpublishContentAction } from "./content.actions";

const ID = "7f095834-fb2a-44d0-89b7-072674a5ce92";
const IDLE = { status: "idle" } as const;
const fields = { slug: "nueva-carrera", category: "news", title: " Nueva carrera ", summary: "Una noticia importante.", body: "Contenido completo de nuestra publicación.", imageUrl: "", imageAlt: "" };
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePermission).mockResolvedValue({ id: "user_admin", email: "admin@example.com", emailVerified: true, staffRoles: ["admin"] });
  vi.mocked(createContentDraft).mockResolvedValue({ id: ID });
  vi.mocked(saveContentDraft).mockResolvedValue("saved");
  vi.mocked(transitionContent).mockResolvedValue("saved");
});

describe("editorial actions", () => {
  it.each([new UnauthorizedError(), new ForbiddenError()])("denies before any database call", async (error) => {
    vi.mocked(requirePermission).mockRejectedValue(error);
    const result = await saveContentAction(IDLE, form(fields));
    expect(result).toMatchObject({ status: "error", code: error instanceof UnauthorizedError ? "unauthorized" : "forbidden" });
    expect(createContentDraft).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("creates only a draft with the session actor and stripped extra keys", async () => {
    await expect(saveContentAction(IDLE, form({ ...fields, createdBy: "attacker", status: "published" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(requirePermission).toHaveBeenCalledWith("content.manage");
    expect(createContentDraft).toHaveBeenCalledExactlyOnceWith({ ...fields, title: "Nueva carrera", imageUrl: null, imageAlt: null }, "user_admin");
    expect(revalidatePath).toHaveBeenCalledWith("/crm/(protected)/contenidos/[id]", "page");
  });
  it("keeps known values after validation errors and never echoes unrelated keys", async () => {
    const result = await saveContentAction(IDLE, form({ ...fields, title: "x", secret: "do-not-echo" }));
    expect(result).toMatchObject({ status: "error", code: "invalid_input", values: { title: "x" } });
    expect(result.status === "error" && result.values).not.toHaveProperty("secret");
    expect(createContentDraft).not.toHaveBeenCalled();
  });
  it("updates with expected version; stale edits do not revalidate", async () => {
    vi.mocked(saveContentDraft).mockResolvedValue("conflict");
    expect(await saveContentAction(IDLE, form({ ...fields, id: ID, version: "4" }))).toMatchObject({ code: "conflict" });
    expect(saveContentDraft).toHaveBeenCalledWith(ID, 4, expect.any(Object), "user_admin");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("rejects file ids instead of treating malformed edit requests as new posts", async () => {
    const data = form({ ...fields, version: "4" });
    data.set("id", new File([ID], "id.txt"));
    expect(await saveContentAction(IDLE, data)).toMatchObject({ code: "invalid_input" });
    expect(createContentDraft).not.toHaveBeenCalled();
    expect(saveContentDraft).not.toHaveBeenCalled();
  });
  it.each([
    [publishContentAction, "publish"], [unpublishContentAction, "unpublish"], [archiveContentAction, "archive"],
  ] as const)("transitions with the server-selected operation", async (action, operation) => {
    expect(await action(IDLE, form({ id: ID, version: "4", status: "published", publishedBy: "attacker" }))).toMatchObject({ status: "success" });
    expect(transitionContent).toHaveBeenCalledExactlyOnceWith(ID, 4, operation, "user_admin");
  });
  it("denies transitions without permission and rejects malformed ids", async () => {
    vi.mocked(requirePermission).mockRejectedValue(new ForbiddenError());
    expect(await publishContentAction(IDLE, form({ id: ID, version: "4" }))).toMatchObject({ code: "forbidden" });
    expect(transitionContent).not.toHaveBeenCalled();
  });
  it("does not echo database errors or their causes", async () => {
    vi.mocked(createContentDraft).mockRejectedValue(new Error("password and private editorial text"));
    const result = await saveContentAction(IDLE, form(fields));
    expect(result).toMatchObject({ code: "unavailable", message: "No pudimos guardar el contenido. Inténtalo de nuevo." });
    expect(result).not.toHaveProperty("cause");
  });
});
