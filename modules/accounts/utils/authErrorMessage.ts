import type { AuthError, AuthErrorContext } from "../types/auth.types";

const TOO_MANY_REQUESTS = "Demasiados intentos. Espera un momento y vuelve a intentarlo.";
const SERVICE_UNAVAILABLE =
  "No pudimos conectar con el servicio de acceso. Inténtalo de nuevo.";
const EMAIL_NOT_VERIFIED = "Tu correo aún no está verificado. Te enviamos un código.";
const ACCOUNT_NOT_CREATED =
  "No se pudo crear la cuenta. Si ya tienes una, inicia sesión o recupera tu contraseña.";
const INVALID_CODE = "Código incorrecto o caducado. Pide uno nuevo.";

const FALLBACK_BY_CONTEXT: Record<AuthErrorContext, string> = {
  "sign-in": "Correo o contraseña incorrectos.",
  "sign-up": "No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.",
  verify: INVALID_CODE,
  recovery: INVALID_CODE,
};

/**
 * Maps a Neon Auth error to a Spanish message. Never returns the third-party
 * `message` and never reveals whether an account exists.
 */
export function authErrorMessage(
  error: AuthError | null,
  context: AuthErrorContext,
): string {
  const status = error?.status;
  const code = error?.code ?? "";
  const isCodeContext = context === "verify" || context === "recovery";

  if (status === 429) return TOO_MANY_REQUESTS;
  if (isCodeContext && code.startsWith("TOO_MANY_ATTEMPTS")) return INVALID_CODE;
  if (!status || status >= 500) return SERVICE_UNAVAILABLE;
  if (context === "sign-in" && code === "EMAIL_NOT_VERIFIED") return EMAIL_NOT_VERIFIED;
  if (context === "sign-up" && code.startsWith("USER_ALREADY_EXISTS")) {
    return ACCOUNT_NOT_CREATED;
  }
  if (isCodeContext && (code === "INVALID_OTP" || code === "OTP_EXPIRED")) {
    return INVALID_CODE;
  }
  return FALLBACK_BY_CONTEXT[context];
}
