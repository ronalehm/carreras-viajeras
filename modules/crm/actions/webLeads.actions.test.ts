// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("../services/turnstile.service", () => ({ verifyTurnstileToken: vi.fn() }));
vi.mock("../services/webLeads.service", () => ({ createWebLead: vi.fn() }));

import { headers } from "next/headers";
import { verifyTurnstileToken } from "../services/turnstile.service";
import { createWebLead } from "../services/webLeads.service";
import type { WebLeadFormState } from "../types/webLeads.types";
import { submitWebLeadAction } from "./webLeads.actions";

const IDLE: WebLeadFormState = { status: "idle" };
const SUBMISSION_ID = "6f9a1c3e-2b4d-4e8f-9a0b-1c2d3e4f5a6b";
const IP = "203.0.113.7";
const VALID = {
  name: "Ana Pérez",
  email: "Ana@Example.com",
  phone: "+51 938 127 170",
  destination: "rio",
  consent: "on",
  submissionId: SUBMISSION_ID,
  "cf-turnstile-response": "synthetic-token",
  website: "",
};

const SUCCESS: WebLeadFormState = {
  status: "success",
  message: "¡Listo! Recibimos tu consulta. Te escribiremos por WhatsApp.",
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(headers).mockResolvedValue(new Headers({ "cf-connecting-ip": IP }) as never);
  vi.mocked(verifyTurnstileToken).mockResolvedValue("valid");
  vi.mocked(createWebLead).mockResolvedValue("created");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("submitWebLeadAction", () => {
  it("verifies Turnstile with the cf-connecting-ip and the submissionId, then creates the lead", async () => {
    const result = await submitWebLeadAction(
      IDLE,
      form({ ...VALID, source: "whatsapp", stage: "paid", ownerUserId: "staff-1", consentVersion: "fake" }),
    );

    expect(result).toEqual(SUCCESS);
    expect(verifyTurnstileToken).toHaveBeenCalledExactlyOnceWith({
      token: "synthetic-token",
      remoteIp: IP,
      idempotencyKey: SUBMISSION_ID,
    });
    // Normalized data only: never the token, the stage, the source or the owner from the form.
    expect(createWebLead).toHaveBeenCalledExactlyOnceWith({
      fullName: "Ana Pérez",
      email: "ana@example.com",
      phone: "+51938127170",
      destination: "rio",
      submissionId: SUBMISSION_ID,
    });
  });

  it("passes remoteIp null without the cf-connecting-ip header", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers() as never);
    await submitWebLeadAction(IDLE, form(VALID));
    expect(verifyTurnstileToken).toHaveBeenCalledWith(expect.objectContaining({ remoteIp: null }));
  });

  it("answers success to a filled honeypot without calling Turnstile or the database", async () => {
    expect(await submitWebLeadAction(IDLE, form({ ...VALID, website: "https://spam.example" }))).toEqual(SUCCESS);
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it("answers success to a filled honeypot even with invalid data", async () => {
    expect(await submitWebLeadAction(IDLE, form({ website: "x" }))).toEqual(SUCCESS);
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it("returns invalid_input with field errors and without calling Turnstile", async () => {
    const result = await submitWebLeadAction(
      IDLE,
      form({ ...VALID, name: "A", email: "ana@", phone: "938127170", destination: "santiago-2027", consent: "" }),
    );

    expect(result).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los datos del formulario.",
      fieldErrors: {
        name: ["Escribe tu nombre (2 a 80 caracteres)."],
        email: ["Escribe un correo válido."],
        phone: ["Escribe el número con código de país, p. ej. +51 938 127 170."],
        destination: ["Elige un destino."],
        consent: ["Necesitamos tu autorización para guardar tus datos."],
      },
    });
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it("returns invalid_input without fieldErrors for an invalid submissionId", async () => {
    expect(await submitWebLeadAction(IDLE, form({ ...VALID, submissionId: "abc" }))).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los datos del formulario.",
    });
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it("returns invalid_input without calling anything when the input exceeds 16 KiB", async () => {
    const result = await submitWebLeadAction(IDLE, form({ ...VALID, extra: "x".repeat(16 * 1024) }));
    expect(result).toEqual({ status: "error", code: "invalid_input", message: "Revisa los datos del formulario." });
    expect(headers).not.toHaveBeenCalled();
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it("returns invalid_input without calling anything when the input contains a file", async () => {
    const data = form(VALID);
    data.set("attachment", new File(["hello"], "hello.txt", { type: "text/plain" }));
    const result = await submitWebLeadAction(IDLE, data);
    expect(result).toEqual({ status: "error", code: "invalid_input", message: "Revisa los datos del formulario." });
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it("returns verification_failed without touching the database when Turnstile is invalid", async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValue("invalid");
    expect(await submitWebLeadAction(IDLE, form(VALID))).toEqual({
      status: "error",
      code: "verification_failed",
      message: "No pudimos verificar el envío. Inténtalo de nuevo.",
    });
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it("returns unavailable without touching the database when Turnstile is unavailable", async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValue("unavailable");
    expect(await submitWebLeadAction(IDLE, form(VALID))).toEqual({
      status: "error",
      code: "unavailable",
      message: "No pudimos enviar tu consulta en este momento. Puedes escribirnos por WhatsApp.",
    });
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it("returns success for a duplicate", async () => {
    vi.mocked(createWebLead).mockResolvedValue("duplicate");
    expect(await submitWebLeadAction(IDLE, form(VALID))).toEqual(SUCCESS);
  });

  it("returns conflict for the same submissionId with other data", async () => {
    vi.mocked(createWebLead).mockResolvedValue("conflict");
    expect(await submitWebLeadAction(IDLE, form(VALID))).toEqual({
      status: "error",
      code: "conflict",
      message: "Ya recibimos una consulta desde este formulario. Recarga la página para enviar otra.",
    });
  });

  it("returns unavailable with a fixed log when the service throws", async () => {
    vi.mocked(createWebLead).mockRejectedValue(
      new Error('insert into leads failed: params ["Ana Pérez","+51938127170","ana@example.com"]'),
    );
    const result = await submitWebLeadAction(IDLE, form(VALID));

    expect(result).toEqual({
      status: "error",
      code: "unavailable",
      message: "No pudimos enviar tu consulta en este momento. Puedes escribirnos por WhatsApp.",
    });
    expect(console.error).toHaveBeenCalledExactlyOnceWith("web lead: capture failed");
  });

  it("returns unavailable with the same fixed log when Turnstile throws", async () => {
    vi.mocked(verifyTurnstileToken).mockRejectedValue(new Error("synthetic-token"));
    expect(await submitWebLeadAction(IDLE, form(VALID))).toMatchObject({ code: "unavailable" });
    expect(console.error).toHaveBeenCalledExactlyOnceWith("web lead: capture failed");
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it("never echoes what was typed", async () => {
    const results = [
      await submitWebLeadAction(IDLE, form({ ...VALID, email: "ana@" })),
      await submitWebLeadAction(IDLE, form(VALID)),
    ];
    vi.mocked(createWebLead).mockResolvedValue("conflict");
    results.push(await submitWebLeadAction(IDLE, form(VALID)));
    const serialized = JSON.stringify(results);
    for (const value of ["Ana Pérez", "ana@", "938 127 170", "synthetic-token", SUBMISSION_ID, IP]) {
      expect(serialized).not.toContain(value);
    }
  });
});
