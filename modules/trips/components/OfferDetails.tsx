import type { ReactNode } from "react";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPenCents, formatUsdPenRate, parseUsdPenRate, usdToPenCents } from "@/lib/currency";
import { formatDateTime } from "@/lib/dates";
import {
  activateOfferAction,
  approveOfferAction,
  closeOfferAction,
  createOfferVersionAction,
} from "../actions/offers.actions";
import type { ExchangeRate, OfferDetail } from "../types/offers.types";
import { offerScopeLabel, offerValidityText } from "../utils/offerDisplay";
import { formatTripDate, formatTripPrice } from "../utils/tripDisplay";
import { OfferStatusBadge } from "./OfferTable";

type OfferDetailsProps = {
  offer: OfferDetail;
  exchangeRate: ExchangeRate | null;
  canManage: boolean;
  today: string; // getTodayDate()
};

type Item = { label: string; value: ReactNode };

const EMPTY = "—";

function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DetailList({ items }: { items: Item[] }) {
  return (
    <dl className="flex flex-col gap-3">
      {items.map(({ label, value }) => (
        <div key={label} className="flex flex-col gap-0.5">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// "Creada por ana@example.com el 18 oct 2026, 22:00"; nothing until the step happened.
function auditLine(verb: string, by: { email: string } | null, at: Date | null): string[] {
  return at ? [`${verb} por ${by?.email ?? EMPTY} el ${formatDateTime(at)}`] : [];
}

// Presentation only. Amounts in USD with their soles at the current rate (lib/currency, exact integer
// math); without a rate, dollars only. The buttons follow the status; the actions decide again.
export function OfferDetails({ offer, exchangeRate, canManage, today }: OfferDetailsProps) {
  const rateE4 = exchangeRate ? parseUsdPenRate(exchangeRate.usdPen) : null;
  const amount = (usd: number) =>
    rateE4 === null ? formatTripPrice(usd) : `${formatTripPrice(usd)} (${formatPenCents(usdToPenCents(usd, rateE4))})`;
  const version = `v${offer.version}`;
  const fields = { offerId: offer.id };
  const conditions = offer.conditions.split("\n").map((line) => line.trim()).filter(Boolean);

  const price: Item[] = [
    { label: "Precio total", value: amount(offer.totalPriceUsd) },
    { label: "Descuento", value: offer.discountUsd > 0 ? amount(offer.discountUsd) : "Sin descuento" },
    { label: "Precio final", value: <span className="font-semibold">{amount(offer.finalPriceUsd)}</span> },
    {
      label: "Tipo de cambio",
      value: exchangeRate && rateE4 !== null
        ? `S/ ${formatUsdPenRate(rateE4)} por US$ 1 (vigente desde el ${formatDateTime(exchangeRate.effectiveFrom)})`
        : "Aún no hay tipo de cambio: solo se muestran dólares.",
    },
  ];

  const deposits: Item[] = offer.depositOptionsUsd.length === 0
    ? [{ label: "Forma de pago", value: "Pago único del precio final." }]
    : [
        {
          label: "Anticipos permitidos",
          value: (
            <ul className="flex flex-col gap-1">
              {offer.depositOptionsUsd.map((deposit) => (
                <li key={deposit}>
                  Anticipo {amount(deposit)} · saldo {amount(offer.finalPriceUsd - deposit)}
                </li>
              ))}
            </ul>
          ),
        },
        { label: "Fecha límite del saldo", value: offer.balanceDueOn ? formatTripDate(offer.balanceDueOn) : EMPTY },
      ];

  const terms: Item[] = [
    { label: "Vigencia", value: offerValidityText(offer.validFrom, offer.validUntil) },
    { label: "Bono", value: offer.bonusDescription ?? EMPTY },
    { label: "Cupos de la oferta", value: offer.capacityLimit ?? "Sin límite" },
    { label: "Versión de las condiciones", value: offer.termsVersion },
    {
      label: "Condiciones de pago y cancelación",
      value: (
        <div className="flex flex-col gap-2">
          {conditions.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
      ),
    },
  ];

  const audit = [
    ...auditLine("Creada", offer.createdBy, offer.createdAt),
    ...auditLine("Aprobada", offer.approvedBy, offer.approvedAt),
    ...auditLine("Activada", offer.activatedBy, offer.activatedAt),
    ...auditLine("Cerrada", offer.closedBy, offer.closedAt),
  ];
  if (offer.supersededByVersion !== null) {
    audit.push(`Sustituida por v${offer.supersededByVersion}`);
  }

  const closeDialog = {
    title: `¿Cerrar la ${version}?`,
    description: "Dejará de aplicarse y no se puede reabrir. Podrás crear una versión nueva a partir de ella.",
  };
  const newVersionButton = (
    <ConfirmActionButton action={createOfferVersionAction} fields={fields} variant="outline"
      label="Crear nueva versión" confirmLabel="Crear nueva versión"
      title={`¿Crear una versión nueva a partir de la ${version}?`}
      description="Se creará un borrador con estas condiciones. Esta versión no cambia y conserva su estado hasta que actives la nueva."
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="flex flex-wrap items-center gap-2">
          <OfferStatusBadge offer={offer} today={today} supersededByVersion={offer.supersededByVersion} />
          <span className="text-sm text-muted-foreground">· {version}</span>
        </p>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {offer.status === "draft" && (
              <ConfirmActionButton action={approveOfferAction} fields={fields} variant="outline"
                label="Aprobar" confirmLabel="Aprobar" title={`¿Aprobar la ${version} de «${offer.name}»?`}
                description={[
                  "Confirma que el negocio aprobó estos importes, anticipos, bono, vigencia, cupos y condiciones. Después no se podrán editar: cualquier cambio será una versión nueva.",
                  offer.campaign && "El código de la campaña es público: cualquiera con su enlace verá este precio.",
                ].filter(Boolean).join(" ")}
              />
            )}
            {offer.status === "approved" && (
              <ConfirmActionButton action={activateOfferAction} fields={fields} variant="outline"
                label="Activar" confirmLabel="Activar" title={`¿Activar la ${version}?`}
                description="Se mostrará en la web de la carrera si está publicada y dentro de su vigencia. Si hay otra versión activa de esta oferta, se cerrará."
              />
            )}
            {(offer.status === "active" || offer.status === "closed") && newVersionButton}
            {offer.status === "active" && (
              <ConfirmActionButton action={closeOfferAction} fields={fields} variant="destructive"
                label="Cerrar" confirmLabel="Cerrar" {...closeDialog} />
            )}
            {(offer.status === "draft" || offer.status === "approved") && (
              <ConfirmActionButton action={closeOfferAction} fields={fields} variant="destructive"
                label="Descartar" confirmLabel="Descartar" {...closeDialog} />
            )}
          </div>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailCard title="Oferta">
          <DetailList items={[
            { label: "Nombre interno", value: offer.name },
            { label: "Viaje", value: offer.trip.title },
            { label: "Ámbito", value: offerScopeLabel(offer.campaign) },
          ]} />
        </DetailCard>
        <DetailCard title="Precio"><DetailList items={price} /></DetailCard>
        <DetailCard title="Anticipos y saldo"><DetailList items={deposits} /></DetailCard>
        <DetailCard title="Condiciones"><DetailList items={terms} /></DetailCard>
        <DetailCard title="Auditoría">
          <ul className="flex flex-col gap-2">
            {audit.map((line) => <li key={line} className="break-words">{line}</li>)}
          </ul>
        </DetailCard>
      </div>
    </div>
  );
}
