import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { leadStageSchema } from "../schemas/leads.schema";
import type { LeadList, LeadListFilters } from "../types/leads.types";
import { LEAD_STAGE_LABELS } from "../utils/leadDisplay";
import { leadListHref } from "../utils/leadListQuery";

type LeadStageSummaryProps = {
  stageCounts: LeadList["stageCounts"];
  filters: LeadListFilters;
};

// Funnel summary: one link per stage (Requirement 1 order). The counts already respect the owner
// filter and ignore the stage filter; each link keeps the owner and goes back to page 1.
export function LeadStageSummary({ stageCounts, filters }: LeadStageSummaryProps) {
  return (
    <nav aria-label="Embudo de leads">
      <ul className="flex flex-wrap gap-2">
        {leadStageSchema.options.map((stage) => {
          const active = filters.stage === stage;
          return (
            <li key={stage}>
              <Link
                href={leadListHref({ ...filters, stage, page: 1 }, 1)}
                aria-current={active ? "page" : undefined}
                className={buttonVariants({ variant: active ? "default" : "outline", size: "sm" })}
              >
                {LEAD_STAGE_LABELS[stage]}
                <span className="tabular-nums">{stageCounts[stage]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
