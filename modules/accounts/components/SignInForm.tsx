"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { signInSchema } from "../schemas/auth.schema";

const INVALID_CREDENTIALS = "Correo o contraseña incorrectos.";

type FieldErrors = { email?: string; password?: string };

export function SignInForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const result = signInSchema.safeParse({
      email: formData.get("email") ?? "",
      password: formData.get("password") ?? "",
    });

    if (!result.success) {
      const errors = z.flattenError(result.error).fieldErrors;
      setFieldErrors({
        email: errors.email ? "Introduce un correo válido." : undefined,
        password: errors.password ? "Introduce tu contraseña." : undefined,
      });
      return;
    }

    setFieldErrors({});
    setPending(true);

    try {
      const { error } = await authClient.signIn.email(result.data);
      if (error) {
        setFormError(INVALID_CREDENTIALS);
        setPending(false);
        return;
      }
    } catch {
      setFormError(INVALID_CREDENTIALS);
      setPending(false);
      return;
    }

    router.replace("/crm");
    router.refresh();
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <h1 className="text-xl font-semibold">Iniciar sesión</h1>

      <div className="flex flex-col gap-2">
        <Label htmlFor="sign-in-email">Correo</Label>
        <Input
          id="sign-in-email"
          name="email"
          type="email"
          autoComplete="email"
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? "sign-in-email-error" : undefined}
        />
        {fieldErrors.email && (
          <p id="sign-in-email-error" role="alert" className="text-sm text-destructive">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="sign-in-password">Contraseña</Label>
        <Input
          id="sign-in-password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={
            fieldErrors.password ? "sign-in-password-error" : undefined
          }
        />
        {fieldErrors.password && (
          <p id="sign-in-password-error" role="alert" className="text-sm text-destructive">
            {fieldErrors.password}
          </p>
        )}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Entrando…" : "Iniciar sesión"}
      </Button>
    </form>
  );
}
