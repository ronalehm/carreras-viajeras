import type { ReactNode } from "react";
import type { StaffRole } from "@/lib/auth/permissions";
import { SignOutButton } from "./SignOutButton";

const ROLE_LABELS: Record<StaffRole, string> = {
  commercial: "Comercial",
  admin: "Admin",
};

type CrmShellProps = {
  email: string;
  roles: readonly StaffRole[];
  children: ReactNode;
};

export function CrmShell({ email, roles, children }: CrmShellProps) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3">
        <p className="font-heading font-medium">CRM Carreras Viajeras</p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-right text-sm">
            <p>{email}</p>
            <p className="text-muted-foreground">
              {roles.map((role) => ROLE_LABELS[role]).join(", ")}
            </p>
          </div>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
