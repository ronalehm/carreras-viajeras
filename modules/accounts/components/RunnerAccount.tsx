"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { AccessPanel } from "./AccessPanel";
import { SignOutButton } from "./SignOutButton";

/** Presentation only: shows the public account state. It protects nothing. */
export function RunnerAccount() {
  const { data, isPending, error } = authClient.useSession();

  if (isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        Cargando…
      </p>
    );
  }

  if (error || !data) return <AccessPanel audience="runner" />;

  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">Qué bueno verte de nuevo.</h1>
      <p className="text-muted-foreground">{data.user.email}</p>
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/cuenta/perfil" className={buttonVariants({ variant: "outline" })}>
          Mi perfil
        </Link>
        <SignOutButton redirectTo="/cuenta" />
      </div>
    </div>
  );
}
