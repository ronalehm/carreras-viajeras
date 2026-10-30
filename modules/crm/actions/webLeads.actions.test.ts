// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("../services/turnstile.service", () => ({ verifyTurnstileToken: vi.fn() }));
vi.mock("../services/webLeads.service", () => ({ createWebLead: vi.fn() }));
vi.mock("@/lib/registrationConsent", () => ({ isRegistrationOpen: vi.fn() }));

import { headers } from "next/headers";
import { isRegistrationOpen } from "@/lib/registrationConsent";
import { verifyTurnstileToken } from "../services/turnstile.service";
import { createWebLead } from "../services/webLeads.service";
import type { WebLeadFormState } from "../types/webLeads.types";
import { submitWebLeadAction } from "./webLeads.actions";

const IDLE: WebLeadFormState = { status: "idle" };
const SUBMISSION_ID = "3f1c2a6e-8b4d-4c1e-9f0a-2b7d5e6c8a91";
const IP = "203.0.113.7";
const VALID = {
  name: "Ana María Pérez",
  email: "Ana@Example.com",
  phone: "+51 938 127 170",
  destination: "rio",
  consent: "on",
  submissionId: SUBMISSION_ID,
  "cf-turnstile-response": "token-abc",
  website: "",
};

const SUCCESS = { status: "success", message: "¡Listo! Recibimos tus datos. Te escribiremos por WhatsApp." };
const UNAVAILABLE = {
  status: "error",
  code: "unavailable",
  message: "No pudimos enviar tus datos en este momento. Puedes escribirnos por WhatsApp.",
};
const TRIP_UNAVAILABLE = {
  status: "error",
  code: "trip_unavailable",
  message: "Esta carrera ya no está disponible para registrarse.",
};
// Without marketing, form or attribution parameters, the schema hands these defaults to createWebLead.
const NO_EXTRAS = {
  marketingOptIn: false,
  form: "contact",
  campaignCode: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  referredBy: null,
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(headers).mockResolvedValue(new Headers({ "cf-connecting-ip": IP, "x-forwarded-for": "198.51.100.1" }));
  vi.mocked(verifyTurnstileToken).mockResolvedValue("valid");
  vi.mocked(createWebLead).mockResolvedValue("created");
  vi.mocked(isRegistrationOpen).mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("submitWebLeadAction", () => {
  it("valid submission: verifies Turnstile with cf-connecting-ip, then creates the lead without the token", async () => {
    expect(await submitWebLeadAction(IDLE, form(VALID))).toEqual(SUCCESS);

    expect(verifyTurnstileToken).toHaveBeenCalledExactlyOnceWith({
      token: "token-abc",
      remoteIp: IP,
      idempotencyKey: SUBMISSION_ID,
    });
    expect(createWebLead).toHaveBeenCalledExactlyOnceWith({
      fullName: "Ana María Pérez",
      email: "ana@example.com",
      phone: "+51938127170",
      destination: "rio",
      submissionId: SUBMISSION_ID,
      ...NO_EXTRAS,
    });
    expect(vi.mocked(verifyTurnstileToken).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(createWebLead).mock.invocationCallOrder[0],
    );
  });

  it("without cf-connecting-ip sends remoteIp null (never another header)", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ "x-forwarded-for": "198.51.100.1" }));
    await submitWebLeadAction(IDLE, form(VALID));
    expect(vi.mocked(verifyTurnstileToken).mock.calls[0][0].remoteIp).toBeNull();
  });

  it("honeypot with text → success without calling Turnstile or the database", async () => {
    expect(await submitWebLeadAction(IDLE, form({ ...VALID, website: "https://spam.example" }))).toEqual(SUCCESS);
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it("invalid data → invalid_input with the field errors, without calling Turnstile", async () => {
    const result = await submitWebLeadAction(
      IDLE,
      form({ ...VALID, name: "A", email: "ana@", destination: "Santiago 2027", consent: "" }),
    );

    expect(result).toEqual({
      status: "error",
      code: "invalid_input",
      message: "Revisa los datos del formulario.",
      fieldErrors: {
        name: ["Escribe tu nombre (2 a 80 caracteres)."],
        email: ["Escribe un correo válido."],
        destination: ["Elige la carrera."],
        consent: ["Necesitamos tu autorización para guardar tus datos."],
      },
    });
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it("an invalid submissionId → invalid_input, with field errors only for visible fields", async () => {
    const result = await submitWebLeadAction(IDLE, form({ ...VALID, submissionId: "abc" }));
    expect(result).toEqual({ status: "error", code: "invalid_input", message: "Revisa los datos del formulario.", fieldErrors: {} });
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it("input over 16 KiB → invalid_input without calling anything", async () => {
    const result = await submitWebLeadAction(IDLE, form({ ...VALID, extra: "x".repeat(16 * 1024) }));

    expect(result).toEqual({ status: "error", code: "invalid_input", message: "Revisa los datos del formulario." });
    expect(headers).not.toHaveBeenCalled();
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it("a File in the form → invalid_input without calling anything (even in the honeypot)", async () => {
    for (const field of ["attachment", "website"]) {
      const data = form(VALID);
      data.set(field, new File(["hello"], "hello.txt", { type: "text/plain" }));

      expect(await submitWebLeadAction(IDLE, data)).toMatchObject({ status: "error", code: "invalid_input" });
    }
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it("Turnstile invalid → verification_failed without touching the database", async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValue("invalid");
    expect(await submitWebLeadAction(IDLE, form(VALID))).toEqual({
      status: "error",
      code: "verification_failed",
      message: "No pudimos verificar el envío. Inténtalo de nuevo.",
    });
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it("an empty Turnstile token is still verified (the service answers invalid)", async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValue("invalid");
    const withoutToken: Partial<typeof VALID> = { ...VALID };
    delete withoutToken["cf-turnstile-response"];

    expect(await submitWebLeadAction(IDLE, form(withoutToken as Record<string, string>))).toMatchObject({ code: "verification_failed" });
    expect(vi.mocked(verifyTurnstileToken).mock.calls[0][0].token).toBe("");
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it("Turnstile unavailable → unavailable without touching the database", async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValue("unavailable");
    expect(await submitWebLeadAction(IDLE, form(VALID))).toEqual(UNAVAILABLE);
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it.each(["created", "existing", "duplicate"] as const)(
    "%s → the same success (never reveals whether the email already existed)",
    async (outcome) => {
      vi.mocked(createWebLead).mockResolvedValue(outcome);
      expect(await submitWebLeadAction(IDLE, form(VALID))).toEqual(SUCCESS);
    },
  );

  it("conflict → conflict", async () => {
    vi.mocked(createWebLead).mockResolvedValue("conflict");
    expect(await submitWebLeadAction(IDLE, form(VALID))).toEqual({
      status: "error",
      code: "conflict",
      message: "Ya recibimos un registro desde este formulario. Recarga la página para enviar otro.",
    });
  });

  it("unknown_trip → trip_unavailable", async () => {
    vi.mocked(createWebLead).mockResolvedValue("unknown_trip");
    expect(await submitWebLeadAction(IDLE, form({ ...VALID, destination: "maraton-x-2020" }))).toEqual(TRIP_UNAVAILABLE);
  });

  it("registration closed (placeholder legal text in production) → unavailable without calling Turnstile or the database", async () => {
    vi.mocked(isRegistrationOpen).mockReturnValue(false);

    expect(await submitWebLeadAction(IDLE, form(VALID))).toEqual(UNAVAILABLE);
    expect(headers).not.toHaveBeenCalled();
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(createWebLead).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("registration closed is checked after the limits and the honeypot, and before the schema", async () => {
    vi.mocked(isRegistrationOpen).mockReturnValue(false);

    expect(await submitWebLeadAction(IDLE, form({ ...VALID, extra: "x".repeat(16 * 1024) }))).toMatchObject({
      code: "invalid_input",
    });
    expect(await submitWebLeadAction(IDLE, form({ ...VALID, website: "https://spam.example" }))).toEqual(SUCCESS);
    expect(isRegistrationOpen).not.toHaveBeenCalled();

    expect(await submitWebLeadAction(IDLE, form({ ...VALID, email: "ana@" }))).toEqual(UNAVAILABLE);
    expect(isRegistrationOpen).toHaveBeenCalledOnce();
  });

  it("passes promotions, the form mark and the normalized attribution, and drops any other key of the form", async () => {
    const manipulated = {
      ...VALID,
      marketing: "on",
      form: "registration",
      c: " MML26 ",
      utm_source: "Instagram",
      utm_medium: "social",
      utm_campaign: "<script>",
      ref: "Club-Lima",
      source: "whatsapp",
      stage: "paid",
      channel: "event",
      campaignId: "0b8f0f5e-9d7a-4c1b-8e2f-1a2b3c4d5e6f",
      ownerUserId: "user_1",
      consentVersion: "otra",
      price: "0",
      modo: "stand",
    };

    expect(await submitWebLeadAction(IDLE, form(manipulated))).toEqual(SUCCESS);
    expect(createWebLead).toHaveBeenCalledExactlyOnceWith({
      fullName: "Ana María Pérez",
      email: "ana@example.com",
      phone: "+51938127170",
      destination: "rio",
      submissionId: SUBMISSION_ID,
      marketingOptIn: true,
      form: "registration",
      campaignCode: "mml26",
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: null,
      referredBy: "club-lima",
    });
  });

  it("the service throws → unavailable, and console.error receives only the fixed text", async () => {
    vi.mocked(createWebLead).mockRejectedValue(new Error("insert failed: +51938127170 ana@example.com"));

    expect(await submitWebLeadAction(IDLE, form(VALID))).toEqual(UNAVAILABLE);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith("web lead: capture failed");
  });

  it("Turnstile throws → unavailable with the same fixed log", async () => {
    vi.mocked(verifyTurnstileToken).mockRejectedValue(new Error(`boom ${IP}`));

    expect(await submitWebLeadAction(IDLE, form(VALID))).toEqual(UNAVAILABLE);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith("web lead: capture failed");
    expect(createWebLead).not.toHaveBeenCalled();
  });

  it("never repeats what was typed in any response", async () => {
    const outcomes: WebLeadFormState[] = [];
    outcomes.push(await submitWebLeadAction(IDLE, form({ ...VALID, phone: "999 888 777", email: "ana@" })));
    vi.mocked(verifyTurnstileToken).mockResolvedValueOnce("invalid");
    outcomes.push(await submitWebLeadAction(IDLE, form(VALID)));
    vi.mocked(createWebLead).mockResolvedValueOnce("conflict");
    outcomes.push(await submitWebLeadAction(IDLE, form(VALID)));
    vi.mocked(createWebLead).mockResolvedValueOnce("unknown_trip");
    outcomes.push(await submitWebLeadAction(IDLE, form(VALID)));
    vi.mocked(createWebLead).mockResolvedValueOnce("existing");
    outcomes.push(await submitWebLeadAction(IDLE, form(VALID)));
    vi.mocked(createWebLead).mockRejectedValueOnce(new Error("Ana María Pérez"));
    outcomes.push(await submitWebLeadAction(IDLE, form(VALID)));

    const serialized = JSON.stringify(outcomes);
    for (const typed of ["Ana María Pérez", "999 888 777", "ana@", "Ana@Example.com", "token-abc", SUBMISSION_ID, IP]) {
      expect(serialized).not.toContain(typed);
    }
  });
});
