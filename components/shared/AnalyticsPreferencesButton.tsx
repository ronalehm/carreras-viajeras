"use client";

import { usePathname } from "next/navigation";
import { ANALYTICS_PREFERENCES_EVENT, isClarityPathAllowed } from "@/lib/clarity";
import { cn } from "@/lib/utils";
import { useClarityProjectId } from "./ClarityAnalytics";

/** Footer button that reopens the analytics banner; shown only where that banner can appear. */
export function AnalyticsPreferencesButton({ className }: { className?: string }) {
  const projectId = useClarityProjectId();
  const pathname = usePathname();
  if (!projectId || !isClarityPathAllowed(pathname)) return null;

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(ANALYTICS_PREFERENCES_EVENT))}
      className={cn(
        "self-start text-left underline underline-offset-4 outline-none hover:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      Preferencias de analítica
    </button>
  );
}
