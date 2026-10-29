import { SignOutButton as ClerkSignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import type { SignOutDestination } from "../types/auth.types";

type SignOutButtonProps = {
  redirectTo?: SignOutDestination;
};

export function SignOutButton({ redirectTo = "/crm/acceso" }: SignOutButtonProps) {
  return (
    <ClerkSignOutButton redirectUrl={redirectTo}>
      <Button variant="outline">Cerrar sesión</Button>
    </ClerkSignOutButton>
  );
}
