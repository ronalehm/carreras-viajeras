"use client";

import { useUser } from "@clerk/nextjs";
import { startTransition, useEffect, useRef } from "react";
import { registerAccountAction } from "../actions/account.actions";
import { AccessPanel } from "./AccessPanel";

/**
 * Presentation only: shows the public account state. It protects nothing.
 * With a session it registers the account once per user id and greets the runner; the account
 * links live in the header's AccountMenu.
 */
export function RunnerAccount() {
  const { isLoaded, isSignedIn, user } = useUser();
  const userId = isSignedIn ? user.id : null;
  const requestedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || requestedFor.current === userId) return;
    requestedFor.current = userId;
    startTransition(async () => {
      try {
        await registerAccountAction();
      } catch {
        // Nothing to show: the greeting does not depend on the result.
      }
    });
  }, [userId]);

  if (!isLoaded) {
    return (
      <p role="status" className="text-muted-foreground">
        Cargando…
      </p>
    );
  }

  if (!isSignedIn) {
    return (
      <>
        <AccessPanel audience="runner" />
        <p className="mt-6 text-xs leading-relaxed">
          Consulta tus carreras y beneficios desde Mi perfil. Las estrellas por referidos y los
          canjes dependen de las reglas y los premios vigentes del programa.
        </p>
      </>
    );
  }

  const name = user.firstName ?? user.fullName ?? user.primaryEmailAddress?.emailAddress;

  return <h1 className="text-2xl font-semibold">Qué bueno verte de nuevo. {name}</h1>;
}
