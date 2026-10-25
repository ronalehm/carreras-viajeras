import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getCrmAccess, getUserDetail, StaffTable, USER_ROLE_FILTER_LABELS } from "@/modules/accounts";

// Fixed title: no name or email in the browser history or shared tabs.
export const metadata: Metadata = { title: "Usuario" };

// Next passes the segment still percent-encoded; a malformed encoding is a 404, not a 500.
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

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">{detail.name ?? detail.email}</h1>
        {detail.name ? <p className="text-muted-foreground">{detail.email}</p> : null}
        {roles.length > 0 || detail.isRunner ? (
          <div className="flex flex-wrap gap-1">
            {roles.map((role) => (
              <Badge key={role} variant="secondary">
                {role === "sponsor" && detail.sponsor
                  ? `${USER_ROLE_FILTER_LABELS.sponsor} · ${detail.sponsor.name}`
                  : USER_ROLE_FILTER_LABELS[role]}
              </Badge>
            ))}
            {detail.isRunner ? <Badge variant="outline">{USER_ROLE_FILTER_LABELS.runner}</Badge> : null}
          </div>
        ) : null}
        {detail.sponsor ? <p className="text-sm">Marca: {detail.sponsor.name}</p> : null}
      </div>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Roles</h2>
        {detail.member ? (
          <StaffTable staff={[detail.member]} />
        ) : (
          <p className="text-muted-foreground">
            {detail.hasRoleProfile
              ? "Sin roles activos. Para devolverle el acceso, invítala de nuevo con su correo."
              : "Esta cuenta no tiene roles del equipo ni de patrocinador. Para dárselos, invítala con su correo desde Usuarios."}
          </p>
        )}
      </section>
      <div>
        <Link href="/crm/admin/usuarios" className={buttonVariants({ variant: "outline" })}>
          Volver a usuarios
        </Link>
      </div>
    </section>
  );
}
