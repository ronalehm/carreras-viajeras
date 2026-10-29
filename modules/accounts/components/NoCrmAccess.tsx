import type { ReactNode } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ForbiddenError } from "@/lib/auth/errors";
import { getCurrentUser } from "@/lib/auth/guards";
import { getPendingRoleRequest } from "../services/roleRequest.service";
import type { OwnPendingRoleRequest } from "../types/roleRequest.types";
import { formatStaffDateTime } from "../utils/staffDisplay";
import { RequestAdminRoleForm } from "./RequestAdminRoleForm";
import { SignOutButton } from "./SignOutButton";

const NO_ACCESS = "Tu cuenta no tiene acceso al CRM.";

// getCurrentUser is cached for the render, so the layout's guard already did the lookup. A failed
// lookup (403) shows the plain message without the button: requesting would fail the same way.
async function readUser() {
  try {
    return await getCurrentUser();
  } catch (error) {
    if (error instanceof ForbiddenError) return null;
    throw error;
  }
}

// If the read fails the button is shown: the request action is idempotent.
async function readPendingRequest(userId: string): Promise<OwnPendingRoleRequest | null> {
  try {
    return await getPendingRoleRequest(userId);
  } catch {
    // Fixed text only: the original database message may contain data.
    console.error("accounts: role request lookup failed");
    return null;
  }
}

async function readContent(): Promise<ReactNode> {
  const user = await readUser();
  // A blocked account (disabled from the CRM) cannot request access: plain text, no button.
  if (!user || user.blocked) return <p>{NO_ACCESS}</p>;
  if (!user.emailVerified) {
    return <p>{NO_ACCESS} Verifica tu correo para poder solicitar acceso.</p>;
  }

  const pending = await readPendingRequest(user.id);
  if (pending) {
    return (
      <div className="flex flex-col gap-2">
        <p>{NO_ACCESS}</p>
        <p className="text-sm text-muted-foreground">
          Solicitud enviada el {formatStaffDateTime(pending.createdAt)}. Un super administrador la
          revisará.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p>{NO_ACCESS}</p>
      <RequestAdminRoleForm />
    </div>
  );
}

export async function NoCrmAccess() {
  const content = await readContent();

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent>{content}</CardContent>
        <CardFooter className="justify-end">
          <SignOutButton />
        </CardFooter>
      </Card>
    </main>
  );
}
