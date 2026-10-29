import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import type { CampaignListItem, CampaignStatus } from "../types/campaigns.types";
import { CAMPAIGN_STATUS_LABELS } from "../utils/campaignDisplay";
import { LEAD_CHANNEL_LABELS } from "../utils/leadDisplay";

const STATUS_VARIANTS = { active: "default", closed: "outline" } as const satisfies Record<CampaignStatus, string>;

const COLUMNS = ["Código", "Nombre", "Viaje", "Canal", "Evento", "Estado", "Registros", "Alta"];

// Campaigns as listCampaigns returns them (active first). "Registros" counts new leads, not visits.
export function CampaignTable({ campaigns }: { campaigns: CampaignListItem[] }) {
  if (campaigns.length === 0) {
    return <p className="text-muted-foreground">Aún no hay campañas. Crea la primera con «Nueva campaña».</p>;
  }
  return (
    <Table>
      <TableCaption>Cuenta registros, no visitas.</TableCaption>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((title) => (
            <TableHead key={title}>{title}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {campaigns.map((campaign) => (
          <TableRow key={campaign.id}>
            <TableCell className="font-medium">
              <Link href={`/crm/campanas/${campaign.id}`} className="underline-offset-4 hover:underline">
                {campaign.code}
              </Link>
            </TableCell>
            <TableCell>{campaign.name}</TableCell>
            <TableCell>{campaign.trip.title}</TableCell>
            <TableCell>{LEAD_CHANNEL_LABELS[campaign.channel]}</TableCell>
            <TableCell>{campaign.eventName ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANTS[campaign.status]}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
            </TableCell>
            <TableCell className="tabular-nums">{campaign.leadCount}</TableCell>
            <TableCell>{formatDateTime(campaign.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
