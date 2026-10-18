"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { forgotPasswordSchema } from "../schemas/auth.schema";
import type { AuthError, FieldErrors, ForgotPasswordInput } from "../types/auth.types";
import { authErrorMessage } from "../utils/authErrorMessage";

type ForgotPasswordFormProps = {
  onCodeRequested: (email: string) => void;
};

/** Only rate limits and network/5xx errors are shown; anything else must not reveal whether the account exists. */
function isRetryable(error: AuthError) {
  return error.status === 429 || !error.status || error.status >= 500;
}

export function ForgotPasswordForm({ onCodeRequested }: ForgotPasswordFormProps) {
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<ForgotPasswordInput>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const result = forgotPasswordSchema.safeParse({ email: formData.get("email") ?? "" });

    if (!result.success) {
      setFieldErrors(z.flattenError(result.error).fieldErrors);
      return;
    }

    setFieldErrors({});
    setPending(true);

    const { email } = result.data;
    try {
      const { error } = await authClient.emailOtp.requestPasswordReset({ email });
      if (error && isRetryable(error)) {
        setFormError(authErrorMessage(error, "recovery"));
        setPending(false);
        return;
      }
    } catch {
      setFormError(authErrorMessage(null, "recovery"));
      setPending(false);
      return;
    }

    onCodeRequested(email);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <h1 className="text-xl font-semibold">Recupera tu contraseña</h1>
      <p className="text-sm text-muted-foreground">
        Te enviaremos un código de 6 dígitos para crear una contraseña nueva.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="forgot-password-email">Correo</Label>
        <Input
          id="forgot-password-email"
          name="email"
          type="email"
          autoComplete="email"
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? "forgot-password-email-error" : undefined}
        />
        {fieldErrors.email && (
          <p id="forgot-password-email-error" role="alert" className="text-sm text-destructive">
            {fieldErrors.email[0]}
          </p>
        )}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar código"}
      </Button>
    </form>
  );
}
