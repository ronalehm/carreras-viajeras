import { Badge } from "@/components/ui/badge";
import { compareToToday } from "@/lib/dates";

type NextActionBadgeProps = {
  date: string;
  today: string;
};

const BADGES = {
  past: { label: "Vencida", variant: "destructive" },
  today: { label: "Hoy", variant: "secondary" },
} as const;

// Status of a next action against today's CRM date: "Vencida" before today, "Hoy" today and
// nothing for a future date. Shared by the list and the lead's detail page.
export function NextActionBadge({ date, today }: NextActionBadgeProps) {
  const status = compareToToday(date, today);
  if (status === "future") return null;
  const { label, variant } = BADGES[status];
  return <Badge variant={variant}>{label}</Badge>;
}
