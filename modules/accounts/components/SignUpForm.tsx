"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { signUpSchema } from "../schemas/auth.schema";
import type { FieldErrors, SignUpInput } from "../types/auth.types";
import { authErrorMessage } from "../utils/authErrorMessage";

type SignUpFormProps = {
  notice: string;
  onRegistered: (email: string) => void;
};

export function SignUpForm({ notice, onRegistered }: SignUpFormProps) {
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SignUpInput>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const result = signUpSchema.safeParse({
      name: formData.get("name") ?? "",
      email: formData.get("email") ?? "",
      password: formData.get("password") ?? "",
      confirmPassword: formData.get("confirmPassword") ?? "",
    });

    if (!result.success) {
      setFieldErrors(z.flattenError(result.error).fieldErrors);
      return;
    }

    setFieldErrors({});
    setPending(true);

    const { name, email, password } = result.data;
    try {
      const { error } = await authClient.signUp.email({ name, email, password });
      if (error) {
        setFormError(authErrorMessage(error, "sign-up"));
        setPending(false);
        return;
      }
    } catch {
      setFormError(authErrorMessage(null, "sign-up"));
      setPending(false);
      return;
    }

    onRegistered(email);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <h1 className="text-xl font-semibold">Crea tu cuenta</h1>
      <p className="text-sm text-muted-foreground">{notice}</p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="sign-up-name">Nombre</Label>
        <Input
          id="sign-up-name"
          name="name"
          autoComplete="name"
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? "sign-up-name-error" : undefined}
        />
        {fieldErrors.name && (
          <p id="sign-up-name-error" role="alert" className="text-sm text-destructive">
            {fieldErrors.name[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="sign-up-email">Correo</Label>
        <Input
          id="sign-up-email"
          name="email"
          type="email"
          autoComplete="email"
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? "sign-up-email-error" : undefined}
        />
        {fieldErrors.email && (
          <p id="sign-up-email-error" role="alert" className="text-sm text-destructive">
            {fieldErrors.email[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="sign-up-password">Contraseña</Label>
        <Input
          id="sign-up-password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? "sign-up-password-error" : undefined}
        />
        {fieldErrors.password && (
          <p id="sign-up-password-error" role="alert" className="text-sm text-destructive">
            {fieldErrors.password[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="sign-up-confirm-password">Confirma la contraseña</Label>
        <Input
          id="sign-up-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={fieldErrors.confirmPassword ? true : undefined}
          aria-describedby={
            fieldErrors.confirmPassword ? "sign-up-confirm-password-error" : undefined
          }
        />
        {fieldErrors.confirmPassword && (
          <p
            id="sign-up-confirm-password-error"
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
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
