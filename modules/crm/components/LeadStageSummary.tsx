import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { leadStageSchema } from "../schemas/leads.schema";
import type { LeadListFilters, LeadStage } from "../types/leads.types";
import { LEAD_STAGE_LABELS } from "../utils/leadDisplay";
import { leadListHref } from "../utils/leadListQuery";

type LeadStageSummaryProps = {
  stageCounts: Record<LeadStage, number>;
  filters: LeadListFilters;
};

// Funnel: one link per stage (Requirement 1 order) to the list filtered by it, keeping the other filters.
export function LeadStageSummary({ stageCounts, filters }: LeadStageSummaryProps) {
  return (
    <nav aria-label="Embudo">
      <ul className="flex flex-wrap gap-2">
        {leadStageSchema.options.map((stage) => {
          const active = filters.stage === stage;
          return (
            <li key={stage}>
              <Link
                href={leadListHref({ ...filters, stage, page: 1 }, 1)}
                aria-current={active ? "page" : undefined}
                className={buttonVariants({ variant: active ? "secondary" : "outline" })}
              >
                {LEAD_STAGE_LABELS[stage]}
                <span className="tabular-nums text-muted-foreground">{stageCounts[stage]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
