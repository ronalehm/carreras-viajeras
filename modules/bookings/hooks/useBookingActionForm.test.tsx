import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BookingActionState } from "../types/bookings.types";
import { useBookingActionForm } from "./useBookingActionForm";

afterEach(cleanup);

type Action = (prev: BookingActionState, formData: FormData) => Promise<BookingActionState>;

function TestForm({ action, resetOnSuccess }: { action: Action; resetOnSuccess?: boolean }) {
  const { formRef, onSubmit, state, pending, errors, values } = useBookingActionForm(action, { resetOnSuccess });
  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <input aria-label="Título" name="title" defaultValue={values?.title} />
      {errors?.title && <p role="alert">{errors.title[0]}</p>}
      {state.status === "success" && <p role="status">{state.message}</p>}
      <button type="submit" disabled={pending}>Enviar</button>
    </form>
  );
}

const input = () => screen.getByLabelText<HTMLInputElement>("Título");

function submit(title: string) {
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: title } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

describe("useBookingActionForm", () => {
  it("sends the form data and keeps what was typed after an error", async () => {
    const action = vi.fn<Action>(async () => ({
      status: "error", code: "invalid_input", message: "Revisa los campos marcados.",
      fieldErrors: { title: ["El título es corto."] }, values: { title: "ab" },
    }));
    render(<TestForm action={action} resetOnSuccess />);
    submit("ab");

    expect((await screen.findByRole("alert")).textContent).toBe("El título es corto.");
    expect(action).toHaveBeenCalledOnce();
    expect(action.mock.calls[0][1].get("title")).toBe("ab");
    expect(input().value).toBe("ab");
  });

  it("clears the fields after a success only with resetOnSuccess", async () => {
    const action = vi.fn<Action>(async () => ({ status: "success", message: "Aviso publicado." }));
    const { unmount } = render(<TestForm action={action} resetOnSuccess />);
    submit("Recojo de kits");
    expect((await screen.findByRole("status")).textContent).toBe("Aviso publicado.");
    await waitFor(() => expect(input().value).toBe(""));
    unmount();

    render(<TestForm action={action} />);
    submit("Recojo de kits");
    expect((await screen.findByRole("status")).textContent).toBe("Aviso publicado.");
    expect(input().value).toBe("Recojo de kits");
  });
});
