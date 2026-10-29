import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { getCrmAccess } from "@/modules/accounts";
import {
  CAMPAIGN_STATUS_LABELS,
  CampaignQr,
  campaignLinks,
  closeCampaignAction,
  formatConversion,
  getCampaignById,
  LEAD_CHANNEL_LABELS,
} from "@/modules/crm";

export const metadata: Metadata = { title: "Campaña" };

const linkClass = "break-all underline underline-offset-4 hover:text-primary";

export default async function CampaignPage({ params }: PageProps<"/crm/campanas/[id]">) {
  const access = await getCrmAccess("leads.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Campaña</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar campañas. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const { id } = await params;
  // getCampaignById validates the id with campaignIdSchema: a non-UUID returns null without a query.
  const campaign = await getCampaignById(id);
  if (!campaign) notFound();
  const links = campaignLinks(getEnv().APP_ORIGIN, campaign.trip.slug, campaign.code);
  const active = campaign.status === "active";

  const data: [string, string][] = [
    ["Código", campaign.code],
    ["Viaje", campaign.trip.title],
    ["Canal", LEAD_CHANNEL_LABELS[campaign.channel]],
    ["Evento o stand", campaign.eventName ?? "—"],
    ["Registros", String(campaign.leadCount)],
    ["Visitas", String(campaign.visitCount)],
    ["Conversión", formatConversion(campaign.leadCount, campaign.visitCount)],
    ["Creada", `${formatDateTime(campaign.createdAt)} por ${campaign.createdBy.email}`],
  ];
  if (campaign.closedAt) {
    data.push(["Cerrada", `${formatDateTime(campaign.closedAt)} por ${campaign.closedBy?.email ?? "—"}`]);
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{campaign.name}</h1>
          <Badge variant={active ? "default" : "outline"}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
        </div>
        {active && (
          <ConfirmActionButton
            action={closeCampaignAction}
            fields={{ campaignId: campaign.id }}
            label="Cerrar campaña"
            title={`¿Cerrar la campaña «${campaign.name}»?`}
            description="El QR y el enlace seguirán abriendo el registro, pero los nuevos registros ya no se atribuirán a esta campaña. No se puede reabrir."
            confirmLabel="Cerrar campaña"
            variant="destructive"
          />
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              {data.map(([term, value]) => (
                <div key={term} className="flex flex-col gap-0.5">
                  <dt className="text-sm text-muted-foreground">{term}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Enlaces y QR</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <dl className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <dt className="text-sm text-muted-foreground">Enlace público (el del QR)</dt>
                <dd>
                  <a href={links.registration} className={linkClass}>{links.registration}</a>
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-sm text-muted-foreground">Enlace del modo stand (solo para la tableta del equipo)</dt>
                <dd>
                  <a href={links.stand} className={linkClass}>{links.stand}</a>
                </dd>
              </div>
            </dl>
            <CampaignQr url={links.registration} code={campaign.code} />
          </CardContent>
        </Card>
      </div>
      <div>
        <Link href="/crm/campanas" className={buttonVariants({ variant: "ghost" })}>Volver a campañas</Link>
      </div>
    </section>
  );
}
