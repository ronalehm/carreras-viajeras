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
          No tienes permiso para gestionar el equipo. Si lo necesitas, pídeselo
          a un administrador.
        </p>
      </section>
    );
  }

  const { staff, invitations } = await listStaffOverview();

  return (
    <section className="space-y-7">
      <CrmPageHeader
        title="Usuarios del equipo"
        section="Administración"
        description="Un equipo conectado para acompañar cada meta. Invita personas y administra sus permisos."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryCard
          label="Miembros activos"
          value={staff.length}
          icon={<UsersRound />}
          description="Personas con acceso al CRM"
        />
        <SummaryCard
          label="Invitaciones vigentes"
          value={invitations.filter((invitation) => !invitation.expired).length}
          icon={<MailCheck />}
          description="Pendientes de aceptar y sin caducar"
        />
      </div>
      <Card className="shadow-none">
        <CardContent>
          <InviteStaffForm />
        </CardContent>
      </Card>
      <Card className="gap-5 overflow-hidden shadow-none">
        <CardHeader className="border-b pb-5">
          <CardTitle>Equipo activo</CardTitle>
          <CardDescription>
            Personas y roles que participan en la gestión.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <StaffTable staff={staff} />
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
          <InvitationsTable invitations={invitations} />
        </CardContent>
      </Card>
    </section>
  );
}
