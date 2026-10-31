import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck, UsersRound } from "lucide-react";
import { CrmPageHeader } from "@/components/shared/CrmPageHeader";
import { SummaryCard } from "@/components/shared/SummaryCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { can, canManageRole, manageableRoles } from "@/lib/auth/permissions";
import {
  getCrmAccess,
  InvitationsTable,
  InviteStaffForm,
  listPendingInvitations,
  listPendingRoleRequests,
  listUsers,
  RoleRequestsTable,
  UserFilters,
  userListFilterSchema,
  UserTable,
} from "@/modules/accounts";
import { getCheckoutStatus, listDemoParticipants } from "@/modules/booking-checkout";

export const metadata: Metadata = { title: "Usuarios" };

const CHECKOUT_LABELS = { off: "apagado", demo: "demo (Stripe TEST)", test: "test", live: "live" } as const;
// ?checkout=habilitados shows only the accounts enabled for the demo checkout; anything else, all.
const ENABLED_FILTER = "habilitados";

export default async function UsersAdminPage({ searchParams }: PageProps<"/crm/admin/usuarios">) {
  // The layout does not re-render on client navigation, so the page checks staff.manage itself.
  const access = await getCrmAccess("staff.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Usuarios</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar usuarios. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }

  // Invalid, empty or repeated values are dropped: the list shows without that filter.
  const filter = userListFilterSchema.parse(await searchParams);
  // Only super_admin may grant admin, so only it reads and resolves admin role requests.
  const canResolveRoleRequests = canManageRole(access.user.staffRoles, "admin");
  // The Checkout column needs offers.manage too, the permission the demo actions re-check.
  const canManageCheckout = can(access.user.staffRoles, "offers.manage");
  const [{ users: listed, truncated }, invitations, roleRequests, participants] = await Promise.all([
    listUsers(filter),
    listPendingInvitations(),
    canResolveRoleRequests ? listPendingRoleRequests() : null,
    canManageCheckout ? listDemoParticipants() : null,
  ]);
  const enabledIds = new Set((participants ?? []).filter((item) => !item.revokedAt).map((item) => item.userId));
  const params = await searchParams;
  const onlyEnabled = canManageCheckout && params.checkout === ENABLED_FILTER;
  const users = onlyEnabled ? listed.filter((user) => enabledIds.has(user.userId)) : listed;
  const filterHref = (checkout?: string) => {
    const query = new URLSearchParams();
    if (filter.q) query.set("q", filter.q);
    if (filter.role) query.set("rol", filter.role);
    if (checkout) query.set("checkout", checkout);
    const search = query.toString();
    return `/crm/admin/usuarios${search ? `?${search}` : ""}`;
  };
  // Presentation only: the actions re-check canManageRole with the current actor.
  const roles = manageableRoles(access.user.staffRoles);
  // Granting sponsor happens on the user's page with a brand. Inviting a sponsor needs a brand too
  // and belongs to accounts-user-management F2: inviteStaffSchema rejects it, so it is not offered.
  const invitableRoles = roles.filter((role) => role !== "sponsor");

  return (
    <section className="space-y-7">
      <CrmPageHeader
        title="Usuarios"
        section="Administración"
        description="Consulta las cuentas del equipo, patrocinadores y corredores. Invita personas y administra sus permisos."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryCard
          label="Cuentas mostradas"
          value={users.length}
          icon={<UsersRound />}
          description={truncated ? "Primeros resultados de la búsqueda" : "Resultados de los filtros actuales"}
        />
        <SummaryCard
          label="Invitaciones vigentes"
          value={invitations.filter((invitation) => !invitation.expired).length}
          icon={<MailCheck />}
          description="Pendientes de aceptar y sin caducar"
        />
      </div>
      {invitableRoles.length > 0 && (
        <Card className="shadow-none">
          <CardContent>
            <InviteStaffForm roles={invitableRoles} />
          </CardContent>
        </Card>
      )}
      {roleRequests && (
        <Card className="gap-5 overflow-hidden shadow-none">
          <CardHeader className="border-b pb-5">
            <CardTitle>Solicitudes de rol</CardTitle>
            <CardDescription>
              Cuentas sin acceso al CRM que piden el rol Admin. Aprueba o rechaza cada solicitud.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <RoleRequestsTable requests={roleRequests} />
          </CardContent>
        </Card>
      )}
      <Card className="gap-5 overflow-hidden shadow-none">
        <CardHeader className="border-b pb-5">
          <CardTitle>Cuentas</CardTitle>
          <CardDescription>
            Busca una cuenta y abre su ficha para consultar sus roles.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-5">
          <UserFilters q={filter.q} role={filter.role} />
          {canManageCheckout && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span>Pago en línea: {CHECKOUT_LABELS[getCheckoutStatus()]}</span>
              <nav aria-label="Filtro de pago en línea" className="flex gap-3 font-medium">
                <Link href={filterHref()} aria-current={onlyEnabled ? undefined : "page"} className={onlyEnabled ? "underline-offset-4 hover:underline" : "underline underline-offset-4"}>Todos</Link>
                <Link href={filterHref(ENABLED_FILTER)} aria-current={onlyEnabled ? "page" : undefined} className={onlyEnabled ? "underline underline-offset-4" : "underline-offset-4 hover:underline"}>Habilitados ({enabledIds.size})</Link>
              </nav>
            </div>
          )}
          <UserTable
            users={users}
            truncated={truncated}
            filtered={Boolean(filter.q || filter.role || onlyEnabled)}
            // Read only: enabling and removing live on each user's page.
            checkoutCell={canManageCheckout ? (user) =>
              enabledIds.has(user.userId) ? <Badge>Habilitado</Badge> : <span className="text-muted-foreground">—</span>
            : undefined}
          />
        </CardContent>
      </Card>
      <Card className="gap-5 overflow-hidden shadow-none">
        <CardHeader className="border-b pb-5">
          <CardTitle>Invitaciones pendientes</CardTitle>
          <CardDescription>
            Consulta su vigencia o revoca una invitación.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <InvitationsTable invitations={invitations} manageableRoles={roles} />
        </CardContent>
      </Card>
    </section>
  );
}
