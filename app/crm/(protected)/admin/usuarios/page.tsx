import type { Metadata } from "next";
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
import { canManageRole, manageableRoles } from "@/lib/auth/permissions";
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

export const metadata: Metadata = { title: "Usuarios" };

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
  const [{ users, truncated }, invitations, roleRequests] = await Promise.all([
    listUsers(filter),
    listPendingInvitations(),
    canResolveRoleRequests ? listPendingRoleRequests() : null,
  ]);
  // Presentation only: the actions re-check canManageRole with the current actor.
  const roles = manageableRoles(access.user.staffRoles);

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
      {roles.length > 0 && (
        <Card className="shadow-none">
          <CardContent>
            <InviteStaffForm roles={roles} />
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
          <UserTable users={users} truncated={truncated} filtered={Boolean(filter.q || filter.role)} />
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
