import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CrmPageHeader } from "@/components/shared/CrmPageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { manageableRoles } from "@/lib/auth/permissions";
import {
  formatAssignmentLabel,
  getCrmAccess,
  getUserDetail,
  StaffTable,
  USER_ROLE_FILTER_LABELS,
} from "@/modules/accounts";

// Fixed title: no name or email in the browser history or shared tabs.
export const metadata: Metadata = { title: "Usuario" };

// Next passes the segment still percent-encoded, so the page decodes it.
function decodeUserId(rawId: string): string | null {
  try {
    return decodeURIComponent(rawId);
  } catch {
    return null;
  }
}

export default async function UserDetailPage({ params }: PageProps<"/crm/admin/usuarios/[id]">) {
  // The layout does not re-render on client navigation, so the page checks staff.manage itself.
  const access = await getCrmAccess("staff.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Usuario</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar usuarios. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }

  const userId = decodeUserId((await params).id);
  // Empty, too long or unknown ids return null (the service skips the query when invalid).
  const detail = userId === null ? null : await getUserDetail(userId);
  if (!detail) notFound();

  const roles = detail.member?.roles.map(({ role }) => role) ?? [];
  const actorRoles = manageableRoles(access.user.staffRoles);

  return (
    <section className="flex flex-col gap-8">
      <CrmPageHeader
        title={detail.name ?? detail.email}
        section="Administración / Usuarios"
        description={detail.name ? detail.email : "Consulta los roles activos de esta cuenta."}
      />
      <div className="flex flex-col gap-2">
        {roles.length > 0 || detail.isRunner ? (
          <div className="flex flex-wrap gap-1">
            {roles.map((role) => (
              <Badge key={role} variant="secondary">
                {formatAssignmentLabel(role, detail.sponsor?.name ?? null)}
              </Badge>
            ))}
            {detail.isRunner ? <Badge variant="outline">{USER_ROLE_FILTER_LABELS.runner}</Badge> : null}
          </div>
        ) : null}
        {detail.sponsor ? <p className="text-sm">Marca: {detail.sponsor.name}</p> : null}
      </div>
      <Card className="gap-5 overflow-hidden shadow-none">
        <CardHeader className="border-b pb-5">
          <CardTitle>Roles</CardTitle>
          <CardDescription>Los cambios se comprueban de nuevo al guardar.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {detail.member ? (
            <StaffTable staff={[detail.member]} manageableRoles={actorRoles} />
          ) : (
            <p className="text-muted-foreground">
              {detail.hasRoleProfile
                ? "Sin roles activos. Para devolverle el acceso al equipo, invítala de nuevo con su correo."
                : "Esta cuenta no tiene roles del equipo ni de patrocinador. Para darle acceso al equipo, invítala con su correo desde Usuarios."}
            </p>
          )}
        </CardContent>
      </Card>
      <div>
        <Link href="/crm/admin/usuarios" className={buttonVariants({ variant: "outline" })}>
          Volver a usuarios
        </Link>
      </div>
    </section>
  );
}
