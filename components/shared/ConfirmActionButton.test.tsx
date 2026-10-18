import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConfirmActionButton, type ConfirmActionState } from "./ConfirmActionButton";

afterEach(cleanup);

function setup(action = vi.fn<(prev: ConfirmActionState, data: FormData) => Promise<ConfirmActionState>>()
  .mockResolvedValue({ status: "success", message: "Hecho." })) {
  render(<ConfirmActionButton action={action} fields={{ id: "trip-1", status: "archived" }}
    label="Archivar" title="¿Archivar el viaje?" description="No se podrá editar."
    confirmLabel="Confirmar archivo" variant="destructive" />);
  fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
  return action;
}

it("abre el diálogo y cancelar no ejecuta la acción", async () => {
  const action = setup();
  expect(await screen.findByRole("alertdialog")).toBeTruthy();
  expect(screen.getByText("¿Archivar el viaje?")).toBeTruthy();
  expect(screen.getByText("No se podrá editar.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(action).not.toHaveBeenCalled();
});

it("envía los campos y cierra después del éxito", async () => {
  const action = setup();
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar archivo" }));
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  expect(action.mock.calls[0][0]).toEqual({ status: "idle" });
  expect(Object.fromEntries(action.mock.calls[0][1])).toEqual({ id: "trip-1", status: "archived" });
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
});

it("mantiene abierto el error y permite corregir/reintentar", async () => {
  const action = vi.fn<(prev: ConfirmActionState, data: FormData) => Promise<ConfirmActionState>>()
    .mockResolvedValueOnce({ status: "error", message: "El viaje cambió de estado." })
    .mockResolvedValueOnce({ status: "success", message: "Hecho." });
  setup(action);
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar archivo" }));
  expect((await screen.findByRole("alert")).textContent).toBe("El viaje cambió de estado.");
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar archivo" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(action).toHaveBeenCalledTimes(2);
});

it("deshabilita confirmar y cancelar mientras procesa", async () => {
  let finish!: (value: ConfirmActionState) => void;
  const action = vi.fn<(prev: ConfirmActionState, data: FormData) => Promise<ConfirmActionState>>()
    .mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  setup(action);
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar archivo" }));
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>("button", { name: "Procesando…" }).disabled).toBe(true));
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Cancelar" }).disabled).toBe(true);
  await act(async () => finish({ status: "success", message: "Hecho." }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
});

it("vuelve a estado inicial al cerrar un error y abrir de nuevo", async () => {
  setup(vi.fn<(prev: ConfirmActionState, data: FormData) => Promise<ConfirmActionState>>()
    .mockResolvedValue({ status: "error", message: "No se pudo cambiar." }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar archivo" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
  await screen.findByRole("alertdialog");
  expect(screen.queryByRole("alert")).toBeNull();
});
