import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { WebLeadFormState } from "@/modules/crm";
import { useLeadCapture } from "./useLeadCapture";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SUCCESS: WebLeadFormState = { status: "success", message: "¡Listo! Recibimos tus datos." };
const INVALID: WebLeadFormState = {
  status: "error", code: "invalid_input", message: "Revisa los datos del formulario.",
  fieldErrors: { email: ["Escribe un correo válido."] },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

function leadForm(): HTMLFormElement {
  const form = document.createElement("form");
  for (const [name, value] of [["name", "Ana Pérez"], ["email", "ana@example.com"], ["destination", "maraton-santiago-2027"]]) {
    const input = document.createElement("input");
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  return form;
}

function setup(...responses: WebLeadFormState[]) {
  const action = vi.fn<(prev: WebLeadFormState, formData: FormData) => Promise<WebLeadFormState>>();
  for (const response of responses) action.mockResolvedValueOnce(response);
  const hook = renderHook(() => useLeadCapture({ action }));
  return { action, hook };
}

async function submitAndWait(hook: ReturnType<typeof setup>["hook"], action: ReturnType<typeof setup>["action"]) {
  const calls = action.mock.calls.length;
  act(() => hook.result.current.submit(leadForm()));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(calls + 1));
  await waitFor(() => expect(hook.result.current.pending).toBe(false));
  return action.mock.calls[calls];
}

it("empieza en idle, sin envío pendiente", () => {
  const { hook } = setup();
  expect(hook.result.current.state).toEqual({ status: "idle" });
  expect(hook.result.current.pending).toBe(false);
});

it("genera el submissionId en el primer envío y manda los campos del formulario", async () => {
  const { action, hook } = setup(SUCCESS);
  const [prev, data] = await submitAndWait(hook, action);
  expect(prev).toEqual({ status: "idle" });
  expect(data.get("submissionId")).toMatch(UUID);
  expect(data.get("name")).toBe("Ana Pérez");
  expect(data.get("email")).toBe("ana@example.com");
  expect(hook.result.current.state).toEqual(SUCCESS);
});

it("marca pending durante el envío e ignora un segundo envío mientras tanto", async () => {
  let resolve!: (state: WebLeadFormState) => void;
  const { action, hook } = setup();
  action.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  act(() => hook.result.current.submit(leadForm()));
  await waitFor(() => expect(hook.result.current.pending).toBe(true));
  act(() => hook.result.current.submit(leadForm()));
  await act(async () => resolve(SUCCESS));
  await waitFor(() => expect(hook.result.current.pending).toBe(false));
  expect(action).toHaveBeenCalledTimes(1);
  expect(hook.result.current.state).toEqual(SUCCESS);
});

it("conserva el submissionId al reintentar tras un error y pasa el estado anterior", async () => {
  const { action, hook } = setup(INVALID, SUCCESS);
  const [, first] = await submitAndWait(hook, action);
  expect(hook.result.current.state).toEqual(INVALID);
  const [prev, retry] = await submitAndWait(hook, action);
  expect(prev).toEqual(INVALID);
  expect(retry.get("submissionId")).toBe(first.get("submissionId"));
});

it("renueva el submissionId tras un éxito", async () => {
  const { action, hook } = setup(SUCCESS, SUCCESS);
  const [, first] = await submitAndWait(hook, action);
  const [, second] = await submitAndWait(hook, action);
  expect(second.get("submissionId")).toMatch(UUID);
  expect(second.get("submissionId")).not.toBe(first.get("submissionId"));
});

it("cambia turnstileResetSignal tras cada respuesta, de error o de éxito", async () => {
  const { action, hook } = setup(INVALID, SUCCESS);
  const initial = hook.result.current.turnstileResetSignal;
  await submitAndWait(hook, action);
  const afterError = hook.result.current.turnstileResetSignal;
  expect(afterError).not.toBe(initial);
  await submitAndWait(hook, action);
  expect(hook.result.current.turnstileResetSignal).not.toBe(afterError);
});

it("startOver vuelve a idle, cambia formKey y el siguiente envío lleva un submissionId nuevo", async () => {
  const { action, hook } = setup(INVALID, SUCCESS);
  const [, first] = await submitAndWait(hook, action);
  const formKey = hook.result.current.formKey;
  act(() => hook.result.current.startOver());
  await waitFor(() => expect(hook.result.current.state).toEqual({ status: "idle" }));
  expect(hook.result.current.formKey).not.toBe(formKey);
  expect(action).toHaveBeenCalledTimes(1);
  const [prev, next] = await submitAndWait(hook, action);
  expect(prev).toEqual({ status: "idle" });
  expect(next.get("submissionId")).toMatch(UUID);
  expect(next.get("submissionId")).not.toBe(first.get("submissionId"));
});

it("no escribe en localStorage, sessionStorage ni cookies", async () => {
  const setItem = vi.spyOn(Storage.prototype, "setItem");
  const { action, hook } = setup(SUCCESS);
  await submitAndWait(hook, action);
  act(() => hook.result.current.startOver());
  await waitFor(() => expect(hook.result.current.state).toEqual({ status: "idle" }));
  expect(setItem).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect(document.cookie).toBe("");
});
