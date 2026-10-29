import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

type SummaryCardProps = {
  label: string;
  value: number | string;
  icon: ReactNode;
  description?: string;
};

export function SummaryCard({
  label,
  value,
  icon,
  description,
}: SummaryCardProps) {
  return (
    <article aria-label={label} className="h-full">
      <Card className="h-full gap-0 rounded-2xl border border-border/60 py-4 shadow-xs ring-0 sm:py-6">
        <CardContent className="flex flex-1 flex-col gap-4 px-4 sm:gap-5 sm:px-6">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <h2 className="text-xs leading-5 font-medium text-muted-foreground sm:text-[13px]">
              {label}
            </h2>
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/7 text-primary sm:size-10 sm:rounded-2xl [&_svg]:size-4 [&_svg]:stroke-[1.75] sm:[&_svg]:size-4.5"
            >
              {icon}
            </span>
          </div>
          <p className="text-3xl leading-none font-semibold tracking-tight tabular-nums sm:text-4xl">
            {value}
          </p>
          {description && (
            <p className="mt-auto border-t border-border/50 pt-3 text-[11px] leading-5 text-muted-foreground sm:text-xs">
              {description}
            </p>
          )}
        </CardContent>
      </Card>
    </article>
  );
}
