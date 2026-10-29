import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../actions/content.actions", () => ({ saveContentAction: vi.fn(), publishContentAction: vi.fn(), unpublishContentAction: vi.fn(), archiveContentAction: vi.fn() }));
import { saveContentAction } from "../actions/content.actions";
import { ContentForm } from "./ContentForm";
import type { ManagedPost } from "../types/content.types";
afterEach(cleanup);
it("preserves typed content after a rejected save and announces the error", async () => {
  vi.mocked(saveContentAction).mockResolvedValue({ status: "error", code: "invalid_input", message: "Revisa los campos marcados.", fieldErrors: { title: ["Completa el título."] } });
  render(<ContentForm />);
  const title = screen.getByLabelText<HTMLInputElement>("Título");
  fireEvent.change(title, { target: { value: "Nueva carrera" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await waitFor(() => expect(title.getAttribute("aria-invalid")).toBe("true"));
  expect(title.value).toBe("Nueva carrera");
  expect(screen.getByText("Completa el título.")).toBeTruthy();
});
it("locks a slug after first publication and makes unchanged published content explicit", () => {
  const post: ManagedPost = { id: "7f095834-fb2a-44d0-89b7-072674a5ce92", slug: "nueva-carrera", status: "published", version: 2, title: "Nueva carrera", category: "news", publishedAt: new Date(), updatedAt: new Date(), hasPendingChanges: false,
    draft: { slug: "nueva-carrera", category: "news", title: "Nueva carrera", summary: "Una noticia importante.", body: "Contenido completo de la nueva publicación.", imageUrl: null, imageAlt: null } };
  render(<ContentForm post={post} />);
  expect(screen.getByLabelText<HTMLInputElement>("Identificador de la URL").readOnly).toBe(true);
  expect(screen.queryByRole("button", { name: "Publicar cambios" })).toBeNull();
  expect(screen.getByRole("button", { name: "Despublicar" })).toBeTruthy();
});
