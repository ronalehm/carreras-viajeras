import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { leadStageSchema } from "../schemas/leads.schema";
import type { LeadListFilters, LeadOwnerOption } from "../types/leads.types";
import { LEAD_STAGE_LABELS } from "../utils/leadDisplay";
import { LEAD_OWNER_PARAMS, leadOwnerParam } from "../utils/leadListQuery";

type LeadFiltersProps = {
  filters: LeadListFilters;
  ownerOptions: LeadOwnerOption[];
};

const OWNER_PRESETS = [
  { filter: "mine", label: "Mis leads" },
  { filter: "unassigned", label: "Sin asignar" },
] as const satisfies { filter: keyof typeof LEAD_OWNER_PARAMS; label: string }[];

// Plain GET form: the filters live in the URL (?etapa=…&responsable=…), never personal data, and
// need no JavaScript. Submitting drops `pagina`, so filtering always starts on page 1.
export function LeadFilters({ filters, ownerOptions }: LeadFiltersProps) {
  return (
    <form method="get" action="/crm/leads" className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="lead-filter-stage">Etapa</Label>
        <NativeSelect id="lead-filter-stage" name="etapa" defaultValue={filters.stage ?? ""}>
          <NativeSelectOption value="">Todas</NativeSelectOption>
          {leadStageSchema.options.map((stage) => (
            <NativeSelectOption key={stage} value={stage}>{LEAD_STAGE_LABELS[stage]}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="lead-filter-owner">Responsable</Label>
        <NativeSelect id="lead-filter-owner" name="responsable" defaultValue={filters.owner ? leadOwnerParam(filters.owner) : ""}>
          <NativeSelectOption value="">Todos</NativeSelectOption>
          {OWNER_PRESETS.map((preset) => (
            <NativeSelectOption key={preset.filter} value={LEAD_OWNER_PARAMS[preset.filter]}>
              {preset.label}
            </NativeSelectOption>
          ))}
          {ownerOptions.map((owner) => (
            <NativeSelectOption key={owner.userId} value={owner.userId}>{owner.email}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" variant="outline">Filtrar</Button>
      <Link href="/crm/leads" className={buttonVariants({ variant: "ghost" })}>Limpiar</Link>
    </form>
  );
}
