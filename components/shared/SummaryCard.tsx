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
    <article aria-label={label}>
      <Card className="gap-0 py-5 shadow-none">
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              {label}
            </h2>
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-lg bg-primary/5 text-primary [&_svg]:size-4"
            >
              {icon}
            </span>
          </div>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </CardContent>
      </Card>
    </article>
  );
}
