"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { AccessPanel } from "./AccessPanel";
import { SignOutButton } from "./SignOutButton";

/** Presentation only: shows the public account state. It protects nothing. */
export function RunnerAccount() {
  const { isLoaded, isSignedIn, user } = useUser();

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
