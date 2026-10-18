import type { z } from "zod";
import type {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  verifyEmailSchema,
} from "../schemas/auth.schema";

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export type AccessStep =
  | "sign-in"
  | "sign-up"
  | "verify-email"
  | "forgot-password"
  | "reset-password";

/** Field errors as returned by `z.flattenError(...).fieldErrors`. */
export type FieldErrors<T> = Partial<Record<keyof T, string[]>>;

/** Subset of the Neon Auth / Better Auth error we rely on. `message` is never shown. */
export type AuthError = { status?: number; code?: string };

export type AuthErrorContext = "sign-in" | "sign-up" | "verify" | "recovery";
