"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { resetPasswordSchema } from "../schemas/auth.schema";
import type { FieldErrors, ResetPasswordInput } from "../types/auth.types";
import { authErrorMessage } from "../utils/authErrorMessage";

type ResetPasswordFormProps = {
  email: string;
  notice?: string;
  onPasswordReset: (email: string) => void;
};

export function ResetPasswordForm({ email, notice, onPasswordReset }: ResetPasswordFormProps) {
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<ResetPasswordInput>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const result = resetPasswordSchema.safeParse({
      otp: formData.get("otp") ?? "",
      password: formData.get("password") ?? "",
      confirmPassword: formData.get("confirmPassword") ?? "",
    });

    if (!result.success) {
      setFieldErrors(z.flattenError(result.error).fieldErrors);
      return;
    }

    setFieldErrors({});
    setPending(true);

    const { otp, password } = result.data;
    try {
      const { error } = await authClient.emailOtp.resetPassword({ email, otp, password });
      if (error) {
        setFormError(authErrorMessage(error, "recovery"));
        setPending(false);
        return;
      }
    } catch {
      setFormError(authErrorMessage(null, "recovery"));
      setPending(false);
      return;
    }

    onPasswordReset(email);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <h1 className="text-xl font-semibold">Nueva contraseña</h1>

      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Introduce el código de 6 dígitos y la nueva contraseña para{" "}
        <span className="font-medium text-foreground">{email}</span>.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-password-otp">Código</Label>
        <Input
          id="reset-password-otp"
          name="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-invalid={fieldErrors.otp ? true : undefined}
          aria-describedby={fieldErrors.otp ? "reset-password-otp-error" : undefined}
        />
        {fieldErrors.otp && (
          <p id="reset-password-otp-error" role="alert" className="text-sm text-destructive">
            {fieldErrors.otp[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-password-password">Nueva contraseña</Label>
        <Input
          id="reset-password-password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? "reset-password-password-error" : undefined}
        />
        {fieldErrors.password && (
          <p id="reset-password-password-error" role="alert" className="text-sm text-destructive">
            {fieldErrors.password[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-password-confirm-password">Confirma la contraseña</Label>
        <Input
          id="reset-password-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={fieldErrors.confirmPassword ? true : undefined}
          aria-describedby={
            fieldErrors.confirmPassword ? "reset-password-confirm-password-error" : undefined
          }
        />
        {fieldErrors.confirmPassword && (
          <p
            id="reset-password-confirm-password-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {fieldErrors.confirmPassword[0]}
          </p>
        )}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
