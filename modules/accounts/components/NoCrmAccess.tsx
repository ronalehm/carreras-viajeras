import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { SignOutButton } from "./SignOutButton";

export function NoCrmAccess() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent>
          <p>Tu cuenta no tiene acceso al CRM. Pide una invitación a un administrador.</p>
        </CardContent>
        <CardFooter className="justify-end">
          <SignOutButton />
        </CardFooter>
      </Card>
    </main>
  );
}
