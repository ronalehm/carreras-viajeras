"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

export type TipCategory = "empezar" | "preparar" | "viajar" | "despues";

export type Tip = {
  category: TipCategory;
  image: string;
  eyebrow: string;
  /** Line breaks with "\n" (rendered with whitespace-pre-line). */
  title: string;
  summary: string;
  body: string;
  source?: { label: string; href: string };
};

const FILTERS: { value: TipCategory | "todos"; label: string }[] = [
  { value: "todos", label: "Todas" },
  { value: "empezar", label: "Empezar" },
  { value: "preparar", label: "Prepararte" },
  { value: "viajar", label: "Viajar" },
  { value: "despues", label: "Después de la meta" },
];

export function TipList({ tips }: { tips: Tip[] }) {
  const [filter, setFilter] = useState<TipCategory | "todos">("todos");

  return (
    <>
      <div role="group" aria-label="Filtrar consejos" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className="min-h-10 cursor-pointer rounded-full border border-primary/25 bg-background px-4 py-2 text-sm font-medium hover:border-primary aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {label}
          </button>
        ))}
      </div>
      <ul>
        {tips.map((tip) => (
          <li
            key={tip.title}
            hidden={filter !== "todos" && tip.category !== filter}
            className="grid grid-cols-[5.5rem_1fr] gap-x-4 border-t border-primary/15 py-6 sm:grid-cols-[8rem_1fr] sm:gap-x-6"
          >
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-night">
              <Image
                src={tip.image}
                alt="Imagen ilustrativa de running y viajes"
                fill
                sizes="(min-width: 640px) 8rem, 5.5rem"
                loading="lazy"
                className="object-cover"
              />
            </div>
            <article className="min-w-0">
              <p className="mb-2 text-sm font-semibold text-asphalt">{tip.eyebrow}</p>
              <h4 className="mb-3 display-title text-3xl leading-none whitespace-pre-line">
                {tip.title}
              </h4>
              <p className="text-sm leading-relaxed text-asphalt">{tip.summary}</p>
              <details className="group pt-3">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  Leer píldora
                  <span aria-hidden className="text-2xl leading-none font-normal">
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">−</span>
                  </span>
                </summary>
                <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-asphalt">{tip.body}</p>
                {tip.source && (
                  <a
                    href={tip.source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-semibold underline decoration-highlight decoration-2 underline-offset-4"
                  >
                    {tip.source.label} <ArrowUpRight aria-hidden className="size-3.5" />
                  </a>
                )}
              </details>
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}
