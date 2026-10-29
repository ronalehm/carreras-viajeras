"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { searchParamsToRecord } from "../utils/inquiry";

/**
 * The race pages are one static shell reached through a rewrite (next.config.ts), so the slug comes
 * from the visible URL (/viajes/<slug> or /viajes/<slug>/registro), never from route params. The
 * query keeps the shape of the page searchParams (first-value rules of firstParam/attributionParams).
 */
export function useTripPageParams() {
  const pathname = usePathname();
  const query = searchParamsToRecord(useSearchParams());
  return { slug: pathname.split("/")[2] ?? "", query };
}
