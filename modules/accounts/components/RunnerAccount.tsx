"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { startTransition, useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { registerAccountAction } from "../actions/account.actions";
import { AccessPanel } from "./AccessPanel";
import { SignOutButton } from "./SignOutButton";

type CrmAccess = { userId: string; canAccessCrm: boolean };

/**
 * Presentation only: shows the public account state. It protects nothing.
 * With a session it registers the account once per user id; the result only decides whether
 * the "Ingresar al CRM" link is shown (the /crm layout stays the guard).
 */
export function RunnerAccount() {
  const { isLoaded, isSignedIn, user } = useUser();
  const userId = isSignedIn ? user.id : null;
  const requestedFor = useRef<string | null>(null);
  const [crmAccess, setCrmAccess] = useState<CrmAccess | null>(null);

  useEffect(() => {
    if (!userId || requestedFor.current === userId) return;
    requestedFor.current = userId;
    startTransition(async () => {
      try {
        const { canAccessCrm } = await registerAccountAction();
        setCrmAccess({ userId, canAccessCrm: canAccessCrm === true });
      } catch {
        // A failed request leaves the link hidden.
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

  if (!isSignedIn) return <AccessPanel audience="runner" />;

  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">Qué bueno verte de nuevo.</h1>
      <p className="text-muted-foreground">{user.primaryEmailAddress?.emailAddress}</p>
      <div className="flex flex-wrap items-start gap-3">
        {crmAccess?.userId === userId && crmAccess.canAccessCrm ? (
          <Link href="/crm" className={buttonVariants()}>
            Ingresar al CRM
          </Link>
        ) : null}
        <Link href="/mis-carreras" className={buttonVariants()}>
          Ver mis carreras
        </Link>
        <Link href="/cuenta/perfil" className={buttonVariants({ variant: "outline" })}>
          Mi cuenta
        </Link>
        <SignOutButton redirectTo="/cuenta" />
      </div>
    </div>
  );
}
