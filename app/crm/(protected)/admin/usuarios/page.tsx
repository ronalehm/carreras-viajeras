import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  getCrmAccess,
  InvitationsTable,
  InviteStaffForm,
  listStaffOverview,
  StaffTable,
} from "@/modules/accounts";

export const metadata: Metadata = {
  title: "Usuarios del equipo",
};

export default async function StaffAdminPage() {
  // The layout does not re-render on client navigation, so the page checks staff.manage itself.
  const access = await getCrmAccess("staff.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");

  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Usuarios del equipo</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar el equipo. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }

  const { staff, invitations } = await listStaffOverview();

  return (
    <section className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Usuarios del equipo</h1>
      <InviteStaffForm />
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Equipo activo</h2>
        <StaffTable staff={staff} />
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Invitaciones pendientes</h2>
        <InvitationsTable invitations={invitations} />
      </section>
    </section>
  );
}
