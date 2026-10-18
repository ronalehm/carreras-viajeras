import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmActionButton, type ConfirmActionState } from "./ConfirmActionButton";

type Action = (prev: ConfirmActionState, formData: FormData) => Promise<ConfirmActionState>;

const TITLE = "¿Publicar «Maratón de Santiago 2027»?";
const DESCRIPTION = "Aparecerá en la web pública con sus datos actuales.";

function renderButton(action: Action) {
  render(
    <ConfirmActionButton
      action={action}
      fields={{ id: "trip-1", status: "published" }}
      label="Publicar"
      title={TITLE}
      description={DESCRIPTION}
      confirmLabel="Publicar"
      variant="outline"
    />,
  );
}

async function flush() {
  await act(async () => {});
}

async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
  await flush();
}

function dialog() {
  return screen.queryByRole("alertdialog");
}

async function confirm() {
  fireEvent.click(screen.getAllByRole("button", { name: "Publicar" }).at(-1)!);
  await flush();
}

afterEach(cleanup);

describe("ConfirmActionButton", () => {
  it("opens the dialog with the title and the description", async () => {
    renderButton(vi.fn<Action>());
    expect(dialog()).toBeNull();

    await open();

    expect(dialog()).not.toBeNull();
    expect(screen.getByText(TITLE)).toBeDefined();
    expect(screen.getByText(DESCRIPTION)).toBeDefined();
  });

  it("sends the fields as FormData and closes on success", async () => {
    const action = vi.fn<Action>().mockResolvedValue({ status: "success", message: "Viaje publicado." });
    renderButton(action);
    await open();

    await confirm();

    expect(action).toHaveBeenCalledTimes(1);
    const [prev, formData] = action.mock.calls[0];
    expect(prev).toEqual({ status: "idle" });
    expect(Object.fromEntries(formData)).toEqual({ id: "trip-1", status: "published" });
    expect(dialog()).toBeNull();
  });

  it("shows the error with role alert and stays open", async () => {
    const action = vi.fn<Action>().mockResolvedValue({
      status: "error",
      message: "El viaje ya no está en ese estado. Recarga la página.",
    });
    renderButton(action);
    await open();

    await confirm();

    expect(dialog()).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(
      "El viaje ya no está en ese estado. Recarga la página.",
    );
  });

  it("closes on Cancelar without calling the action", async () => {
    const action = vi.fn<Action>();
    renderButton(action);
    await open();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await flush();

    expect(dialog()).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });
});
