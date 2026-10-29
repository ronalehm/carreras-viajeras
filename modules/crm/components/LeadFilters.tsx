import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { leadChannelSchema, leadStageSchema } from "../schemas/leads.schema";
import type { LeadListFilters, LeadOwnerOption } from "../types/leads.types";
import { LEAD_CHANNEL_LABELS, LEAD_STAGE_LABELS, UNASSIGNED_OWNER_LABEL } from "../utils/leadDisplay";
import {
  FOLLOW_UP_PARAMS,
  LEAD_LIST_PATH,
  OWNER_PARAMS,
  QUERY_KEYS,
  STAGE_PARAMS,
  ownerToParam,
  stageToParam,
} from "../utils/leadListQuery";

type LeadFiltersProps = {
  filters: LeadListFilters;
  ownerOptions: LeadOwnerOption[];
};

// Native GET form, no client JavaScript: the filters travel in the URL and a new filter starts at page 1.
export function LeadFilters({ filters, ownerOptions }: LeadFiltersProps) {
  return (
    <form method="get" action={LEAD_LIST_PATH} className="flex min-w-0 flex-wrap items-end gap-4">
      {filters.view === "list" && <input type="hidden" name={QUERY_KEYS.view} value="lista" />}
      <div className="flex min-w-0 max-w-full flex-col gap-2">
        <Label htmlFor="lead-filter-stage">Etapa</Label>
        <NativeSelect
          id="lead-filter-stage"
          className="max-w-full"
          name={QUERY_KEYS.stage}
          defaultValue={filters.stage ? stageToParam(filters.stage) : ""}
        >
          <NativeSelectOption value="">Todas</NativeSelectOption>
          {leadStageSchema.options.map((stage) => (
            <NativeSelectOption key={stage} value={stage}>
              {LEAD_STAGE_LABELS[stage]}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value={STAGE_PARAMS.archived}>Archivados</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="flex min-w-0 max-w-full flex-col gap-2">
        <Label htmlFor="lead-filter-owner">Responsable</Label>
        <NativeSelect
          id="lead-filter-owner"
          className="max-w-full"
          name={QUERY_KEYS.owner}
          defaultValue={filters.owner ? ownerToParam(filters.owner) : ""}
        >
          <NativeSelectOption value="">Todos</NativeSelectOption>
          <NativeSelectOption value={OWNER_PARAMS.mine}>Mis leads</NativeSelectOption>
          <NativeSelectOption value={OWNER_PARAMS.unassigned}>{UNASSIGNED_OWNER_LABEL}</NativeSelectOption>
          {ownerOptions.map((owner) => (
            <NativeSelectOption key={owner.userId} value={owner.userId}>
              {owner.email}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="flex min-w-0 max-w-full flex-col gap-2">
        <Label htmlFor="lead-filter-follow-up">Seguimiento</Label>
        <NativeSelect
          id="lead-filter-follow-up"
          className="max-w-full"
          name={QUERY_KEYS.followUp}
          defaultValue={filters.followUp ? FOLLOW_UP_PARAMS[filters.followUp] : ""}
        >
          <NativeSelectOption value="">Todos</NativeSelectOption>
          <NativeSelectOption value={FOLLOW_UP_PARAMS.overdue}>Vencidos</NativeSelectOption>
          <NativeSelectOption value={FOLLOW_UP_PARAMS.pending}>Pendientes (hoy o vencidos)</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="flex min-w-0 max-w-full flex-col gap-2">
        <Label htmlFor="lead-filter-channel">Origen</Label>
        <NativeSelect id="lead-filter-channel" className="max-w-full" name={QUERY_KEYS.channel} defaultValue={filters.channel ?? ""}>
          <NativeSelectOption value="">Todos</NativeSelectOption>
          {leadChannelSchema.options.map((channel) => (
            <NativeSelectOption key={channel} value={channel}>
              {LEAD_CHANNEL_LABELS[channel]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="outline">Filtrar</Button>
        <Link href={filters.view === "list" ? `${LEAD_LIST_PATH}?vista=lista` : LEAD_LIST_PATH} className={buttonVariants({ variant: "ghost" })}>Limpiar</Link>
      </div>
    </form>
  );
}
