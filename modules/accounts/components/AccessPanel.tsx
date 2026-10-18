"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AccessStep } from "../types/auth.types";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";
import { VerifyEmailForm } from "./VerifyEmailForm";

type AccessState = { step: AccessStep; email: string; notice?: string };

export function AccessPanel() {
  const [state, setState] = useState<AccessState>({ step: "sign-in", email: "" });

  const goToSignIn = (email = state.email, notice?: string) =>
    setState({ step: "sign-in", email, notice });
  const goToVerifyEmail = (email: string) => setState({ step: "verify-email", email });

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col gap-2">
        {state.step === "sign-in" && (
          <SignInForm
            defaultEmail={state.email}
            notice={state.notice}
            onUnverified={goToVerifyEmail}
            onSignUp={() => setState({ step: "sign-up", email: "" })}
          />
        )}

        {state.step === "sign-up" && <SignUpForm onRegistered={goToVerifyEmail} />}

        {state.step === "verify-email" && (
          <VerifyEmailForm
            email={state.email}
            onVerifiedWithoutSession={(email) =>
              goToSignIn(email, "Correo verificado. Inicia sesión.")
            }
          />
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
