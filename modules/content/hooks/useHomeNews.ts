"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchHomeNews } from "../services/homeNews.api";

export const contentQueryKeys = { homeNews: ["content", "home-news"] } as const;

// At most one retry: an unavailable endpoint shows the fixed notice instead of retrying in a loop.
export function useHomeNews() {
  return useQuery({ queryKey: contentQueryKeys.homeNews, queryFn: fetchHomeNews, retry: 1 });
}
