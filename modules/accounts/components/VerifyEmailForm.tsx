"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { verifyEmailSchema } from "../schemas/auth.schema";
import type { FieldErrors, VerifyEmailInput } from "../types/auth.types";
import { authErrorMessage } from "../utils/authErrorMessage";

const RESEND_COOLDOWN_MS = 30_000;

type VerifyEmailFormProps = {
  email: string;
  onVerifiedWithoutSession: (email: string) => void;
};

export function VerifyEmailForm({ email, onVerifiedWithoutSession }: VerifyEmailFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [resendCoolingDown, setResendCoolingDown] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<VerifyEmailInput>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!resendCoolingDown) return;
    const timeout = setTimeout(() => setResendCoolingDown(false), RESEND_COOLDOWN_MS);
    return () => clearTimeout(timeout);
  }, [resendCoolingDown]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setResendNotice(null);

    const formData = new FormData(event.currentTarget);
    const result = verifyEmailSchema.safeParse({ otp: formData.get("otp") ?? "" });

    if (!result.success) {
      setFieldErrors(z.flattenError(result.error).fieldErrors);
      return;
    }

    setFieldErrors({});
    setPending(true);

    try {
      const { error } = await authClient.emailOtp.verifyEmail({ email, otp: result.data.otp });
      if (error) {
        setFormError(authErrorMessage(error, "verify"));
        setPending(false);
        return;
      }
    } catch {
      setFormError(authErrorMessage(null, "verify"));
      setPending(false);
      return;
    }

    // The email is verified at this point; without a session the user signs in manually.
    const hasSession = await authClient.getSession().then(
      ({ data }) => Boolean(data?.session),
      () => false,
    );

    if (!hasSession) {
      onVerifiedWithoutSession(email);
      return;
    }

    router.replace("/crm");
    router.refresh();
  }

  async function handleResend() {
    setFormError(null);
    setResendNotice(null);
    setResendCoolingDown(true);

    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      if (error) {
        setFormError(authErrorMessage(error, "verify"));
        return;
      }
      setResendNotice("Te enviamos un código nuevo.");
    } catch {
      setFormError(authErrorMessage(null, "verify"));
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <h1 className="text-xl font-semibold">Verifica tu correo</h1>
      <p className="text-sm text-muted-foreground">
        Introduce el código de 6 dígitos que enviamos a{" "}
        <span className="font-medium text-foreground">{email}</span>.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="verify-email-otp">Código</Label>
        <Input
          id="verify-email-otp"
          name="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-invalid={fieldErrors.otp ? true : undefined}
          aria-describedby={fieldErrors.otp ? "verify-email-otp-error" : undefined}
        />
        {fieldErrors.otp && (
          <p id="verify-email-otp-error" role="alert" className="text-sm text-destructive">
            {fieldErrors.otp[0]}
          </p>
        )}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      {resendNotice && (
        <p role="status" className="text-sm text-muted-foreground">
          {resendNotice}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Verificando…" : "Verificar"}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={handleResend}
        disabled={pending || resendCoolingDown}
      >
        Reenviar código
      </Button>
    </form>
  );
}
