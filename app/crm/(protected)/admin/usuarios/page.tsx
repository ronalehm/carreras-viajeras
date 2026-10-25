import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getCrmAccess,
  InvitationsTable,
  InviteStaffForm,
  listPendingInvitations,
  listUsers,
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

  // Invalid, empty or repeated ?q= / ?rol= values are dropped: the list shows without that filter.
  const filter = userListFilterSchema.parse(await searchParams);
  const [{ users, truncated }, invitations] = await Promise.all([
    listUsers(filter),
    listPendingInvitations(),
  ]);

  return (
    <section className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Usuarios</h1>
      <InviteStaffForm />
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Cuentas</h2>
        <UserFilters q={filter.q} role={filter.role} />
        <UserTable users={users} truncated={truncated} filtered={Boolean(filter.q || filter.role)} />
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Invitaciones pendientes</h2>
        <InvitationsTable invitations={invitations} />
      </section>
    </section>
  );
}
