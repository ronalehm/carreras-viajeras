import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authClient, router } = vi.hoisted(() => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    emailOtp: { sendVerificationOtp: vi.fn(), verifyEmail: vi.fn() },
    getSession: vi.fn(),
  },
  router: { replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock("@/lib/auth/client", () => ({ authClient }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { AccessPanel } from "./AccessPanel";

const OK = { data: {}, error: null };
const INVALID_CREDENTIALS = "Correo o contraseña incorrectos.";
const TOO_MANY_REQUESTS = "Demasiados intentos. Espera un momento y vuelve a intentarlo.";
const SERVICE_UNAVAILABLE =
  "No pudimos conectar con el servicio de acceso. Inténtalo de nuevo.";
const INVALID_CODE = "Código incorrecto o caducado. Pide uno nuevo.";

function failure(status: number, code?: string) {
  return { data: null, error: { status, statusText: "", code, message: "English text" } };
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function button(name: string) {
  return screen.getByRole<HTMLButtonElement>("button", { name });
}

async function flush() {
  await act(async () => {});
}

async function signIn(email = "admin@example.com", password = "secret") {
  type("Correo", email);
  type("Contraseña", password);
  fireEvent.click(button("Iniciar sesión"));
  await flush();
}

async function signUp(overrides: Partial<Record<string, string>> = {}) {
  const values = {
    Nombre: "Ana",
    Correo: " Ana@Example.com ",
    Contraseña: "12345678",
    "Confirma la contraseña": "12345678",
    ...overrides,
  };
  fireEvent.click(button("¿Te invitaron? Crea tu cuenta"));
  for (const [label, value] of Object.entries(values)) type(label, value);
  fireEvent.click(button("Crear cuenta"));
  await flush();
}

async function goToVerifyStep() {
  authClient.signUp.email.mockResolvedValue(OK);
  await signUp();
  expect(screen.getByRole("heading", { name: "Verifica tu correo" })).toBeTruthy();
}

async function verify(otp = "123456") {
  type("Código", otp);
  fireEvent.click(button("Verificar"));
  await flush();
}

beforeEach(() => {
  vi.clearAllMocks();
  render(<AccessPanel />);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AccessPanel · sign in", () => {
  it("goes to /crm after a successful sign in", async () => {
    authClient.signIn.email.mockResolvedValue(OK);

    await signIn(" Admin@Example.com ");

    expect(authClient.signIn.email).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "secret",
    });
    expect(router.replace).toHaveBeenCalledWith("/crm");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows field errors without calling Neon Auth", async () => {
    await signIn("nope", "");

    expect(screen.getByText("Introduce un correo válido.")).toBeTruthy();
    expect(screen.getByText("Introduce tu contraseña.")).toBeTruthy();
    expect(authClient.signIn.email).not.toHaveBeenCalled();
  });

  it("disables the button while waiting and shows the generic message on 401", async () => {
    let resolve!: (value: unknown) => void;
    authClient.signIn.email.mockReturnValue(new Promise((r) => (resolve = r)));

    await signIn();

    expect(button("Entrando…").disabled).toBe(true);

    resolve(failure(401, "INVALID_EMAIL_OR_PASSWORD"));
    await flush();

    expect(screen.getByText(INVALID_CREDENTIALS)).toBeTruthy();
    expect(button("Iniciar sesión").disabled).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("sends a new code and moves to verification on EMAIL_NOT_VERIFIED", async () => {
    authClient.signIn.email.mockResolvedValue(failure(403, "EMAIL_NOT_VERIFIED"));
    authClient.emailOtp.sendVerificationOtp.mockResolvedValue(OK);

    await signIn("pending@example.com", "12345678");

    expect(authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({
      email: "pending@example.com",
      type: "email-verification",
    });
    expect(screen.getByRole("heading", { name: "Verifica tu correo" })).toBeTruthy();
    expect(screen.getByText("pending@example.com")).toBeTruthy();
  });

  it("shows the rate-limit message on 429", async () => {
    authClient.signIn.email.mockResolvedValue(failure(429));

    await signIn();

    expect(screen.getByText(TOO_MANY_REQUESTS)).toBeTruthy();
  });

  it("shows the connection message on a network error", async () => {
    authClient.signIn.email.mockRejectedValue(new TypeError("Failed to fetch"));

    await signIn();

    expect(screen.getByText(SERVICE_UNAVAILABLE)).toBeTruthy();
  });
});

describe("AccessPanel · sign up", () => {
  it("shows the invitation form", () => {
    fireEvent.click(button("¿Te invitaron? Crea tu cuenta"));

    expect(screen.getByRole("heading", { name: "Crea tu cuenta" })).toBeTruthy();
    expect(screen.getByText("Solo para personas invitadas por un administrador.")).toBeTruthy();
    for (const label of ["Nombre", "Correo", "Contraseña", "Confirma la contraseña"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it("does not call signUp.email when the passwords differ", async () => {
    await signUp({ "Confirma la contraseña": "87654321" });

    expect(screen.getByText("Las contraseñas no coinciden.")).toBeTruthy();
    expect(authClient.signUp.email).not.toHaveBeenCalled();
  });

  it("does not call signUp.email when the password is too short", async () => {
    await signUp({ Contraseña: "1234567", "Confirma la contraseña": "1234567" });

    expect(screen.getByText("La contraseña debe tener al menos 8 caracteres.")).toBeTruthy();
    expect(authClient.signUp.email).not.toHaveBeenCalled();
  });

  it("creates the account and moves to verification with the email", async () => {
    await goToVerifyStep();

    expect(authClient.signUp.email).toHaveBeenCalledWith({
      name: "Ana",
      email: "ana@example.com",
      password: "12345678",
    });
    expect(screen.getByText("ana@example.com")).toBeTruthy();
    expect(button("Verificar")).toBeTruthy();
    expect(button("Reenviar código")).toBeTruthy();
    expect(authClient.emailOtp.sendVerificationOtp).not.toHaveBeenCalled();
  });

  it("shows a generic message when the email already exists", async () => {
    authClient.signUp.email.mockResolvedValue(
      failure(422, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"),
    );

    await signUp();

    expect(
      screen.getByText(
        "No se pudo crear la cuenta. Si ya tienes una, inicia sesión o recupera tu contraseña.",
      ),
    ).toBeTruthy();
  });

  it("goes back to sign in", () => {
    fireEvent.click(button("¿Te invitaron? Crea tu cuenta"));
    fireEvent.click(button("Volver a iniciar sesión"));

    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeTruthy();
  });
});

describe("AccessPanel · verify email", () => {
  it("goes to /crm when the code is correct and there is a session", async () => {
    await goToVerifyStep();
    authClient.emailOtp.verifyEmail.mockResolvedValue(OK);
    authClient.getSession.mockResolvedValue({ data: { session: {}, user: {} }, error: null });

    await verify(" 123456 ");

    expect(authClient.emailOtp.verifyEmail).toHaveBeenCalledWith({
      email: "ana@example.com",
      otp: "123456",
    });
    expect(authClient.getSession).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/crm");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("returns to sign in with the email and a notice when there is no session", async () => {
    await goToVerifyStep();
    authClient.emailOtp.verifyEmail.mockResolvedValue(OK);
    authClient.getSession.mockResolvedValue({ data: null, error: null });

    await verify();

    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeTruthy();
    expect(screen.getByText("Correo verificado. Inicia sesión.")).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Correo").value).toBe("ana@example.com");
  });

  it("rejects a malformed code without calling Neon Auth", async () => {
    await goToVerifyStep();

    await verify("12ab");

    expect(screen.getByText("Introduce el código de 6 dígitos.")).toBeTruthy();
    expect(authClient.emailOtp.verifyEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["INVALID_OTP", 400],
    ["OTP_EXPIRED", 400],
    ["TOO_MANY_ATTEMPTS", 403],
  ])("shows the invalid-code message for %s", async (code, status) => {
    await goToVerifyStep();
    authClient.emailOtp.verifyEmail.mockResolvedValue(failure(status, code));

    await verify();

    expect(screen.getByText(INVALID_CODE)).toBeTruthy();
    expect(authClient.getSession).not.toHaveBeenCalled();
  });

  it("shows the rate-limit message on 429", async () => {
    await goToVerifyStep();
    authClient.emailOtp.verifyEmail.mockResolvedValue(failure(429));

    await verify();

    expect(screen.getByText(TOO_MANY_REQUESTS)).toBeTruthy();
  });

  it("resends the code and disables the button for 30 seconds", async () => {
    await goToVerifyStep();
    authClient.emailOtp.sendVerificationOtp.mockResolvedValue(OK);
    vi.useFakeTimers();

    fireEvent.click(button("Reenviar código"));
    await flush();

    expect(authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({
      email: "ana@example.com",
      type: "email-verification",
    });
    expect(button("Reenviar código").disabled).toBe(true);

    act(() => vi.advanceTimersByTime(29_999));
    expect(button("Reenviar código").disabled).toBe(true);

    act(() => vi.advanceTimersByTime(1));
    expect(button("Reenviar código").disabled).toBe(false);
  });
});
