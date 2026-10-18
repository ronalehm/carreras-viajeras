import { describe, expect, it } from "vitest";
import type { AuthErrorContext } from "../types/auth.types";
import { authErrorMessage } from "./authErrorMessage";

const TOO_MANY_REQUESTS = "Demasiados intentos. Espera un momento y vuelve a intentarlo.";
const SERVICE_UNAVAILABLE =
  "No pudimos conectar con el servicio de acceso. Inténtalo de nuevo.";
const INVALID_CODE = "Código incorrecto o caducado. Pide uno nuevo.";
const INVALID_CREDENTIALS = "Correo o contraseña incorrectos.";
const ACCOUNT_EXISTS =
  "No se pudo crear la cuenta. Si ya tienes una, inicia sesión o recupera tu contraseña.";
const SIGN_UP_FAILED = "No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.";

const CONTEXTS: AuthErrorContext[] = ["sign-in", "sign-up", "verify", "recovery"];

describe("authErrorMessage", () => {
  it.each(CONTEXTS)("maps 429 to the rate-limit message in %s", (context) => {
    expect(authErrorMessage({ status: 429, code: "INVALID_OTP" }, context)).toBe(
      TOO_MANY_REQUESTS,
    );
  });

  it.each(["verify", "recovery"] as const)(
    "maps TOO_MANY_ATTEMPTS codes to the invalid-code message in %s",
    (context) => {
      expect(authErrorMessage({ status: 403, code: "TOO_MANY_ATTEMPTS" }, context)).toBe(
        INVALID_CODE,
      );
      expect(
        authErrorMessage({ status: 400, code: "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE" }, context),
      ).toBe(INVALID_CODE);
    },
  );

  it.each(CONTEXTS)("maps network errors and 5xx to the service message in %s", (context) => {
    expect(authErrorMessage(null, context)).toBe(SERVICE_UNAVAILABLE);
    expect(authErrorMessage({}, context)).toBe(SERVICE_UNAVAILABLE);
    expect(authErrorMessage({ status: 500 }, context)).toBe(SERVICE_UNAVAILABLE);
    expect(authErrorMessage({ status: 503, code: "INVALID_OTP" }, context)).toBe(
      SERVICE_UNAVAILABLE,
    );
  });

  it("maps EMAIL_NOT_VERIFIED in sign-in", () => {
    expect(authErrorMessage({ status: 403, code: "EMAIL_NOT_VERIFIED" }, "sign-in")).toBe(
      "Tu correo aún no está verificado. Te enviamos un código.",
    );
  });

  it("maps USER_ALREADY_EXISTS codes in sign-up", () => {
    expect(authErrorMessage({ status: 422, code: "USER_ALREADY_EXISTS" }, "sign-up")).toBe(
      ACCOUNT_EXISTS,
    );
    expect(
      authErrorMessage(
        { status: 422, code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
        "sign-up",
      ),
    ).toBe(ACCOUNT_EXISTS);
  });

  it.each(["verify", "recovery"] as const)(
    "maps INVALID_OTP and OTP_EXPIRED in %s",
    (context) => {
      expect(authErrorMessage({ status: 400, code: "INVALID_OTP" }, context)).toBe(
        INVALID_CODE,
      );
      expect(authErrorMessage({ status: 400, code: "OTP_EXPIRED" }, context)).toBe(
        INVALID_CODE,
      );
    },
  );

  it("maps any other 4xx per context", () => {
    expect(authErrorMessage({ status: 400 }, "sign-in")).toBe(INVALID_CREDENTIALS);
    expect(authErrorMessage({ status: 400 }, "sign-up")).toBe(SIGN_UP_FAILED);
    expect(authErrorMessage({ status: 400 }, "verify")).toBe(INVALID_CODE);
    expect(authErrorMessage({ status: 400 }, "recovery")).toBe(INVALID_CODE);
  });

  it("returns the same sign-in message for every 4xx except EMAIL_NOT_VERIFIED", () => {
    const errors = [
      { status: 401, code: "INVALID_EMAIL_OR_PASSWORD" },
      { status: 401 },
      { status: 404, code: "USER_NOT_FOUND" },
      { status: 400, code: "INVALID_EMAIL" },
      { status: 403, code: "USER_ALREADY_EXISTS" },
      { status: 400, code: "INVALID_OTP" },
    ];

    for (const error of errors) {
      expect(authErrorMessage(error, "sign-in")).toBe(INVALID_CREDENTIALS);
    }
  });

  it("does not apply context-specific codes outside their context", () => {
    expect(authErrorMessage({ status: 403, code: "EMAIL_NOT_VERIFIED" }, "sign-up")).toBe(
      SIGN_UP_FAILED,
    );
    expect(authErrorMessage({ status: 403, code: "TOO_MANY_ATTEMPTS" }, "sign-up")).toBe(
      SIGN_UP_FAILED,
    );
  });

  it("never returns the third-party message", () => {
    const error = { status: 401, code: "X", message: "Invalid email or password" };

    for (const context of CONTEXTS) {
      expect(authErrorMessage(error, context)).not.toContain(error.message);
    }
  });
});
