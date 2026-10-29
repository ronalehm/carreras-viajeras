import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { can, type StaffRole } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { STAFF_ROLE_LABELS } from "../utils/staffDisplay";
import { CrmSidebar, type CrmNavItem } from "./CrmSidebar";
import styles from "./CrmShell.module.css";

type CrmShellProps = {
  email: string;
  roles: readonly StaffRole[];
  children: ReactNode;
};

export function CrmShell({ email, roles, children }: CrmShellProps) {
  // Presentation only: pages and actions still authorize every operation on the server.
  const items: CrmNavItem[] = [
    { label: "Dashboard", href: "/crm", icon: "dashboard", group: "overview" },
  ];
  if (can(roles, "leads.manage")) {
    items.push(
      { label: "Leads", href: "/crm/leads", icon: "leads", group: "sales" },
      {
        label: "Mis pendientes",
        href: "/crm/leads?responsable=mios&seguimiento=pendientes",
        icon: "pending",
        group: "sales",
      },
      {
        label: "Campañas",
        href: "/crm/campanas",
        icon: "campaigns",
        group: "sales",
      },
    );
  }
  if (can(roles, "trips.manage"))
    items.push({
      label: "Viajes",
      href: "/crm/viajes",
      icon: "trips",
      group: "sales",
    });
  if (can(roles, "offers.view"))
    items.push({
      label: "Ofertas",
      href: "/crm/ofertas",
      icon: "offers",
      group: "sales",
    });
  if (can(roles, "bookings.manage"))
    items.push({
      label: "Reservas",
      href: "/crm/reservas",
      icon: "bookings",
      group: "sales",
    });
  if (can(roles, "staff.manage")) {
    items.push(
      {
        label: "Usuarios",
        href: "/crm/admin/usuarios",
        icon: "users",
        group: "admin",
      },
      {
        label: "Configuraciones",
        href: "/crm/configuraciones",
        icon: "settings",
        group: "admin",
      },
    );
  }

  return (
    <div className={cn(styles.workspace, "min-h-svh bg-muted/30")}>
      <a
        href="#crm-main-content"
        className="sr-only fixed top-3 left-3 z-60 rounded-lg bg-card p-3 text-sm focus:not-sr-only"
      >
        Ir al contenido
      </a>
      <CrmSidebar
        email={email}
        roleLabels={roles.map((role) => STAFF_ROLE_LABELS[role])}
        items={items}
      />
      <div className="min-w-0 lg:pl-64">
        <div
          className={cn(
            styles.chrome,
            "hidden h-16 items-center justify-between px-10 text-xs font-medium lg:flex",
          )}
        >
          <span>Panel de gestión</span>
          <Link
            href="/"
            className={buttonVariants({
              variant: "ghost",
              className: "gap-2 rounded-xl text-xs",
            })}
          >
            Ver sitio público
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
        <main
          id="crm-main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl min-w-0 px-4 py-8 outline-none sm:px-6 lg:px-10 lg:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
