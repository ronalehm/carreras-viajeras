import Link from "next/link";
import { ArrowUpRight, ShieldCheck, UsersRound } from "lucide-react";
import { CrmPageHeader } from "@/components/shared/CrmPageHeader";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { StaffRole } from "@/lib/auth/permissions";
import { STAFF_ROLE_LABELS } from "../utils/staffDisplay";

type CrmSettingsProps = { email: string; roles: readonly StaffRole[] };

export function CrmSettings({ email, roles }: CrmSettingsProps) {
  return (
    <section className="space-y-7">
      <CrmPageHeader
        title="Configuraciones"
        section="Administración"
        description="Consulta tu cuenta y administra los accesos de tu equipo."
      />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Tu cuenta</CardTitle>
            <CardDescription>
              Identidad con la que accedes al CRM.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-5 text-sm">
              <div>
                <dt className="mb-1.5 text-muted-foreground">
                  Correo electrónico
                </dt>
                <dd className="font-medium break-all">{email}</dd>
              </div>
              <div>
                <dt className="mb-2 text-muted-foreground">Roles del equipo</dt>
                <dd className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {STAFF_ROLE_LABELS[role]}
                    </Badge>
                  ))}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Accesos y permisos</CardTitle>
            <CardDescription>
              Gestiona quién puede trabajar en Carreras Viajeras.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              El acceso requiere correo verificado y un rol activo. Las
              invitaciones y los permisos se administran desde Usuarios.
            </p>
            <Link
              href="/crm/admin/usuarios"
              className={buttonVariants({ variant: "outline" })}
            >
              <UsersRound aria-hidden="true" />
              Gestionar usuarios
            </Link>
          </CardContent>
        </Card>
        <Card className="shadow-none xl:col-span-2">
          <CardHeader>
            <CardTitle>Carreras Viajeras</CardTitle>
            <CardDescription>
              Experiencias de viaje para vivir tu próxima carrera.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              Ver sitio público
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
