import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import type { OfferListItem, OfferStatus } from "../types/offers.types";
import { OFFER_STATUS_LABELS, offerScopeLabel, offerTiming, offerValidityText } from "../utils/offerDisplay";
import { formatTripPrice } from "../utils/tripDisplay";

const STATUS_VARIANTS = {
  draft: "secondary",
  approved: "outline",
  active: "default",
  closed: "ghost",
} as const satisfies Record<OfferStatus, string>;

const TIMING_SUFFIXES = { scheduled: "programada", expired: "vencida", in_force: null } as const;

const COLUMNS = ["Viaje", "Ámbito", "Versión", "Estado", "Precio final", "Vigencia", "Aprobada"];

type OfferStatusBadgeProps = {
  offer: Pick<OfferListItem, "status" | "validFrom" | "validUntil" | "campaign">;
  today: string;
  // Only the detail knows which version replaced a closed one.
  supersededByVersion?: number | null;
};

// Status plus what keeps an active version from applying: not started yet, expired or its campaign closed.
export function OfferStatusBadge({ offer, today, supersededByVersion = null }: OfferStatusBadgeProps) {
  const suffixes: string[] = [];
  if (offer.status === "active") {
    const timing = TIMING_SUFFIXES[offerTiming(offer.validFrom, offer.validUntil, today)];
    if (timing) suffixes.push(timing);
  }
  if (offer.status !== "closed" && offer.campaign?.status === "closed") suffixes.push("campaña cerrada");
  if (offer.status === "closed" && supersededByVersion !== null) {
    suffixes.push(`sustituida por v${supersededByVersion}`);
  }
  const variant = offer.status === "active" && suffixes.length > 0 ? "destructive" : STATUS_VARIANTS[offer.status];
  return (
    <Badge variant={variant}>{[OFFER_STATUS_LABELS[offer.status], ...suffixes].join(" · ")}</Badge>
  );
}

// Offer versions as listOffers returns them; also the history of a scope in the offer detail.
export function OfferTable({ offers, today }: { offers: OfferListItem[]; today: string }) {
  if (offers.length === 0) {
    return (
      <p className="text-muted-foreground">Aún no hay ofertas. El admin crea la primera con «Nueva oferta».</p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((title) => (
            <TableHead key={title}>{title}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {offers.map((offer) => (
          <TableRow key={offer.id}>
            <TableCell>
              <p className="font-medium">{offer.trip.title}</p>
              <Link href={`/crm/ofertas/${offer.id}`}
                className="text-sm underline underline-offset-4 hover:text-primary">
                {offer.name}
              </Link>
            </TableCell>
            <TableCell>{offerScopeLabel(offer.campaign)}</TableCell>
            <TableCell className="tabular-nums">v{offer.version}</TableCell>
            <TableCell><OfferStatusBadge offer={offer} today={today} /></TableCell>
            <TableCell className="tabular-nums">{formatTripPrice(offer.finalPriceUsd)}</TableCell>
            <TableCell className="whitespace-normal">{offerValidityText(offer.validFrom, offer.validUntil)}</TableCell>
            <TableCell>{offer.approvedAt ? formatDateTime(offer.approvedAt) : "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
