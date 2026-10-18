"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { signInSchema } from "../schemas/auth.schema";
import type { FieldErrors, SignInInput } from "../types/auth.types";
import { authErrorMessage } from "../utils/authErrorMessage";

type SignInFormProps = {
  defaultEmail?: string;
  notice?: string;
  onUnverified: (email: string) => void;
  onForgotPassword: () => void;
  onSignUp: () => void;
};

export function SignInForm({
  defaultEmail,
  notice,
  onUnverified,
  onForgotPassword,
  onSignUp,
}: SignInFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SignInInput>>({});
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
      setFieldErrors(z.flattenError(result.error).fieldErrors);
      return;
    }

    setFieldErrors({});
    setPending(true);

    try {
      const { email } = result.data;
      const { error } = await authClient.signIn.email(result.data);

      if (error?.code === "EMAIL_NOT_VERIFIED") {
        const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
          email,
          type: "email-verification",
        });
        if (!sendError) {
          onUnverified(email);
          return;
        }
        // The password was correct: a failed send is a service problem, never "wrong credentials".
        setFormError(authErrorMessage(sendError.status === 429 ? sendError : null, "sign-in"));
        setPending(false);
        return;
      }

      if (error) {
        setFormError(authErrorMessage(error, "sign-in"));
        setPending(false);
        return;
      }
    } catch {
      setFormError(authErrorMessage(null, "sign-in"));
      setPending(false);
      return;
    }

    router.replace("/crm");
    router.refresh();
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <h1 className="text-xl font-semibold">Iniciar sesión</h1>

      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="sign-in-email">Correo</Label>
        <Input
          id="sign-in-email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={defaultEmail}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? "sign-in-email-error" : undefined}
        />
        {fieldErrors.email && (
          <p id="sign-in-email-error" role="alert" className="text-sm text-destructive">
            {fieldErrors.email[0]}
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
          aria-describedby={fieldErrors.password ? "sign-in-password-error" : undefined}
        />
        {fieldErrors.password && (
          <p id="sign-in-password-error" role="alert" className="text-sm text-destructive">
            {fieldErrors.password[0]}
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

      <Button type="button" variant="link" onClick={onForgotPassword}>
        ¿Olvidaste tu contraseña?
      </Button>
      <Button type="button" variant="link" onClick={onSignUp}>
        ¿Te invitaron? Crea tu cuenta
      </Button>
    </form>
  );
}
