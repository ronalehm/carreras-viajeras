"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AccessStep } from "../types/auth.types";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";
import { VerifyEmailForm } from "./VerifyEmailForm";

type AccessState = { step: AccessStep; email: string; notice?: string };

const UNVERIFIED_NOTICE = "Tu correo aún no está verificado. Te enviamos un código.";
const RECOVERY_CODE_NOTICE = "Si existe una cuenta con ese correo, te enviamos un código.";

export function AccessPanel() {
  const [state, setState] = useState<AccessState>({ step: "sign-in", email: "" });

  const goToSignIn = (email = state.email, notice?: string) =>
    setState({ step: "sign-in", email, notice });
  const goToVerifyEmail = (email: string, notice?: string) =>
    setState({ step: "verify-email", email, notice });
  const goToForgotPassword = () => setState({ step: "forgot-password", email: "" });

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col gap-2">
        {state.step === "sign-in" && (
          <SignInForm
            defaultEmail={state.email}
            notice={state.notice}
            onUnverified={(email) => goToVerifyEmail(email, UNVERIFIED_NOTICE)}
            onForgotPassword={goToForgotPassword}
            onSignUp={() => setState({ step: "sign-up", email: "" })}
          />
        )}

        {state.step === "sign-up" && <SignUpForm onRegistered={(email) => goToVerifyEmail(email)} />}

        {state.step === "verify-email" && (
          <>
            {state.notice && (
              <p role="status" className="text-sm text-muted-foreground">
                {state.notice}
              </p>
            )}
            <VerifyEmailForm
              email={state.email}
              onVerifiedWithoutSession={(email) =>
                goToSignIn(email, "Correo verificado. Inicia sesión.")
              }
            />
          </>
        )}

        {state.step === "forgot-password" && (
          <ForgotPasswordForm
            onCodeRequested={(email) =>
              setState({ step: "reset-password", email, notice: RECOVERY_CODE_NOTICE })
            }
          />
        )}

        {state.step === "reset-password" && (
          <>
            <ResetPasswordForm
              email={state.email}
              notice={state.notice}
              onPasswordReset={(email) =>
                goToSignIn(email, "Contraseña actualizada. Inicia sesión.")
              }
            />
            <Button type="button" variant="link" onClick={goToForgotPassword}>
              Pedir un código nuevo
            </Button>
          </>
        )}

        {state.step !== "sign-in" && (
          <Button type="button" variant="link" onClick={() => goToSignIn()}>
            Volver a iniciar sesión
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
