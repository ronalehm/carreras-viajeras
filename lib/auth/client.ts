import { createAuthClient } from "@neondatabase/auth/next";

// Neon's codes (from `normalizeBetterAuthError`) back to the Better Auth codes the forms expect.
const BETTER_AUTH_CODES: Record<string, string> = {
  email_not_confirmed: "EMAIL_NOT_VERIFIED",
  invalid_credentials: "INVALID_EMAIL_OR_PASSWORD",
  user_already_exists: "USER_ALREADY_EXISTS",
};

function toErrorResult(error: unknown) {
  if (typeof error !== "object" || error === null) throw error;
  const { status, code, message } = error as { status?: unknown; code?: unknown; message?: unknown };
  if (typeof status !== "number") throw error; // network failures etc. keep throwing
  const neonCode = typeof code === "string" ? code : undefined;
  return {
    data: null,
    error: { status, code: (neonCode && BETTER_AUTH_CODES[neonCode]) ?? neonCode, message },
  };
}

/**
 * Neon's client throws on non-2xx responses instead of returning `{ data, error }`
 * like Better Auth. This recursive Proxy turns those rejections back into
 * `{ data: null, error }` for every method (`signIn.email`, `emailOtp.*`, `signOut`...).
 * Sync results and hooks (`useSession`) pass through untouched.
 */
function withErrorResults<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, key) {
      const value = Reflect.get(obj, key);
      return (typeof value === "function" || (typeof value === "object" && value !== null))
        ? withErrorResults(value)
        : value;
    },
    apply(fn, thisArg, args) {
      const result = Reflect.apply(fn as (...a: unknown[]) => unknown, thisArg, args);
      return result instanceof Promise ? result.catch(toErrorResult) : result;
    },
  });
}

export const authClient = withErrorResults(createAuthClient());
