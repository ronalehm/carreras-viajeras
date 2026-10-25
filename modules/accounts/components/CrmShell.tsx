import type { ReactNode } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { can, type StaffRole } from "@/lib/auth/permissions";
import { STAFF_ROLE_LABELS } from "../utils/staffDisplay";
import { SignOutButton } from "./SignOutButton";

type CrmShellProps = {
  email: string;
  roles: readonly StaffRole[];
  children: ReactNode;
};

export function CrmShell({ email, roles, children }: CrmShellProps) {
  // Visual only: each page and Server Action checks its permission again.
  const canManageStaff = can(roles, "staff.manage");
  const canManageTrips = can(roles, "trips.manage");
  const canManageBookings = can(roles, "bookings.manage");
  const canManageSponsors = can(roles, "sponsors.manage");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/crm" className="font-heading font-medium">
            CRM Carreras Viajeras
          </Link>
          {(canManageStaff || canManageTrips || canManageBookings || canManageSponsors) && (
            <nav aria-label="CRM" className="flex flex-wrap gap-1">
              {canManageTrips && (
                <Link href="/crm/viajes" className={buttonVariants({ variant: "ghost" })}>
                  Viajes
                </Link>
              )}
              {canManageBookings && (
                <Link href="/crm/reservas" className={buttonVariants({ variant: "ghost" })}>
                  Reservas
                </Link>
              )}
              {canManageSponsors && (
                <Link href="/crm/admin/patrocinadores" className={buttonVariants({ variant: "ghost" })}>
                  Patrocinadores
                </Link>
              )}
              {canManageStaff && (
                <Link href="/crm/admin/usuarios" className={buttonVariants({ variant: "ghost" })}>
                  Usuarios
                </Link>
              )}
            </nav>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-right text-sm">
            <p>{email}</p>
            <p className="text-muted-foreground">
              {roles.map((role) => STAFF_ROLE_LABELS[role]).join(", ")}
            </p>
          </div>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
