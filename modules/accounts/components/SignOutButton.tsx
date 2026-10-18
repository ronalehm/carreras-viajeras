"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import type { SignOutDestination } from "../types/auth.types";

type SignOutButtonProps = {
  redirectTo?: SignOutDestination;
};

export function SignOutButton({ redirectTo = "/crm/acceso" }: SignOutButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSignOut() {
    setPending(true);
    setFailed(false);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        setFailed(true);
        return;
      }
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={handleSignOut} disabled={pending}>
        Cerrar sesión
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          No se pudo cerrar sesión.
        </p>
      )}
    </div>
  );
}
