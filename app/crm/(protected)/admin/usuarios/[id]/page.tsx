import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { CrmPageHeader } from "@/components/shared/CrmPageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can, canManageRole, canRemoveAccounts, manageableRoles } from "@/lib/auth/permissions";
import {
  AccountStatusSection,
  formatAssignmentLabel,
  getCrmAccess,
  getUserDetail,
  StaffTable,
  USER_ROLE_FILTER_LABELS,
} from "@/modules/accounts";
import {
  getCheckoutStatus,
  grantDemoParticipantAction,
  listDemoParticipants,
  revokeDemoParticipantAction,
} from "@/modules/booking-checkout";
import { listSponsors } from "@/modules/sponsors";

// Fixed title: no name or email in the browser history or shared tabs.
export const metadata: Metadata = { title: "Usuario" };

const CHECKOUT_LABELS = { off: "apagado", demo: "demo (Stripe TEST)", test: "test", live: "live" } as const;
const ACCOUNT_STATUS_LABELS = { active: "Activa", disabled: "Desactivada", deleted: "Eliminada" } as const;

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

  // A deleted account only exists for super_admin (accounts-role-requests R16).
  const canRemove = canRemoveAccounts(access.user.staffRoles);
  const deleted = detail.status === "deleted";
  if (deleted && !canRemove) notFound();

  const roles = detail.member?.roles.map(({ role }) => role) ?? [];
  const actorRoles = manageableRoles(access.user.staffRoles);
  // R22: every account that signed in has a profile, so roles are granted without an invitation.
  const staffMember =
    detail.member ?? (detail.hasRoleProfile ? { userId: detail.userId, email: detail.email, roles: [] } : null);
  // R21: brands are read only when the sponsor form can appear (the actor manages sponsor).
  const showSponsorForm =
    detail.status === "active" &&
    staffMember !== null &&
    !roles.includes("sponsor") &&
    canManageRole(access.user.staffRoles, "sponsor");
  const sponsors = showSponsorForm ? await listSponsors() : [];
  // R17: never on the own account nor on a super_admin; the actions check it again.
  const showAccount =
    canRemove && detail.userId !== access.user.id && !roles.includes("super_admin");
  // "Pago en línea" needs offers.manage, the permission the demo actions re-check on the server.
  const canManageCheckout = !deleted && can(access.user.staffRoles, "offers.manage");
  const paymentEnabled = canManageCheckout
    ? (await listDemoParticipants()).some((item) => item.userId === detail.userId && !item.revokedAt)
    : false;

  // Sections are kept in fixed positions (null when hidden), so a status change re-renders the
  // "Cuenta" card in place and it keeps its message.
  return (
    <section className="flex flex-col gap-8">
      {deleted ? (
        <CrmPageHeader
          title="Cuenta eliminada"
          section="Administración / Usuarios"
          description="Su perfil de runner y su correo se borraron; se conserva solo como autora del historial."
        />
      ) : (
        <CrmPageHeader
          title={detail.name ?? detail.email}
          section="Administración / Usuarios"
          description={detail.name ? detail.email : "Consulta los roles activos de esta cuenta."}
        />
      )}
      {deleted ? null : (
        <div className="flex flex-col gap-2">
          {roles.length > 0 || detail.isRunner ? (
            <div className="flex flex-wrap gap-1">
              {roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {formatAssignmentLabel(role, detail.sponsor?.name ?? null)}
                </Badge>
              ))}
              {detail.isRunner ? <Badge variant="outline">{USER_ROLE_FILTER_LABELS.runner}</Badge> : null}
              {detail.status === "disabled" ? <Badge variant="destructive">Desactivada</Badge> : null}
            </div>
          ) : null}
          {detail.sponsor ? <p className="text-sm">Marca: {detail.sponsor.name}</p> : null}
        </div>
      )}
      {deleted ? null : (
        <Card className="gap-5 overflow-hidden shadow-none">
          <CardHeader className="border-b pb-5">
            <CardTitle>Datos</CardTitle>
            <CardDescription>Solo lectura: los datos personales los gestiona la persona desde su cuenta.</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div><dt className="text-muted-foreground">Nombre</dt><dd className="font-medium">{detail.name ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Correo</dt><dd className="font-medium break-all">{detail.email}</dd></div>
              <div><dt className="text-muted-foreground">Cuenta</dt><dd className="font-medium">{ACCOUNT_STATUS_LABELS[detail.status]}</dd></div>
            </dl>
          </CardContent>
        </Card>
      )}
      {canManageCheckout ? (
        <Card className="gap-5 overflow-hidden shadow-none">
          <CardHeader className="border-b pb-5">
            <CardTitle>Pago en línea</CardTitle>
            <CardDescription>Modo actual: {CHECKOUT_LABELS[getCheckoutStatus()]}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {paymentEnabled ? <Badge>Habilitado</Badge> : <Badge variant="outline">No habilitado</Badge>}
            {detail.status !== "active" ? null : paymentEnabled ? (
              <ConfirmActionButton action={revokeDemoParticipantAction} fields={{ userId: detail.userId }} label="Quitar pago"
                title="Quitar el pago en línea" description="Esta cuenta dejará de ver y usar el checkout." confirmLabel="Quitar pago" variant="outline" />
            ) : (
              <ConfirmActionButton action={grantDemoParticipantAction} fields={{ email: detail.email, note: "" }} label="Habilitar pago"
                title="Habilitar el pago en línea" description="Esta cuenta podrá ver y usar el checkout (demo con Stripe TEST y reservas simuladas)." confirmLabel="Habilitar pago" variant="outline" />
            )}
          </CardContent>
        </Card>
      ) : null}
      {deleted ? null : (
        <Card className="gap-5 overflow-hidden shadow-none">
          <CardHeader className="border-b pb-5">
            <CardTitle>Roles</CardTitle>
            <CardDescription>Los cambios se comprueban de nuevo al guardar.</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {/* Disabling revoked every role and grants are refused (no_change): no role controls. */}
            {detail.status === "disabled" ? (
              <p className="text-muted-foreground">Reactiva la cuenta para asignar roles.</p>
            ) : staffMember ? (
              <StaffTable staff={[staffMember]} manageableRoles={actorRoles} sponsors={sponsors} />
            ) : (
              <p className="text-muted-foreground">
                Esta cuenta no tiene roles del equipo ni de patrocinador. Para darle acceso al equipo, invítala con su
                correo desde Usuarios.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {showAccount ? (
        <Card className="gap-5 overflow-hidden shadow-none">
          <CardHeader className="border-b pb-5">
            <CardTitle>Cuenta</CardTitle>
            <CardDescription>Solo un super administrador puede desactivar o eliminar cuentas.</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <AccountStatusSection userId={detail.userId} email={detail.email} status={detail.status} />
          </CardContent>
        </Card>
      ) : null}
      <div>
        <Link href="/crm/admin/usuarios" className={buttonVariants({ variant: "outline" })}>
          Volver a usuarios
        </Link>
      </div>
    </section>
  );
}
