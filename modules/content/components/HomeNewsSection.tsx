"use client";

import { useHomeNews } from "../hooks/useHomeNews";
import { NewsSection, type NewsSectionState } from "./NewsSection";

export function HomeNewsSection() {
  const { status, data } = useHomeNews();
  const news: NewsSectionState =
    status === "pending" ? { status: "loading" }
      : status === "error" ? { status: "error" }
        : data.length ? { status: "ok", posts: data } : { status: "empty" };
  return <NewsSection news={news} />;
}
