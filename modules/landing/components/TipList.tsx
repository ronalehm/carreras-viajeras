"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
      <div role="group" aria-label="Filtrar consejos" className="mb-6 flex flex-wrap gap-1.5">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className="cursor-pointer rounded-full border border-primary/25 bg-background px-3 py-2 text-xs aria-pressed:border-b-3 aria-pressed:border-b-highlight aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-6">
        {tips.map((tip, index) => (
          <article
            key={tip.title}
            hidden={filter !== "todos" && tip.category !== filter}
            className={cn(
              "overflow-hidden rounded-md border",
              index % 2 === 0 ? "border-highlight/40" : "border-primary/20",
            )}
          >
            <div className="relative h-56 sm:h-48">
              <Image
                src={tip.image}
                alt="Imagen ilustrativa de running y viajes"
                fill
                sizes="(min-width: 768px) 45vw, 100vw"
                loading="lazy"
                className="object-cover"
              />
            </div>
            <div className="p-5">
              <p
                className={cn(
                  "mb-4 text-xs font-bold tracking-widest",
                  index % 2 === 0 ? "text-highlight" : "text-primary",
                )}
              >
                {tip.eyebrow}
              </p>
              <h4 className="mb-4 font-heading text-3xl leading-tight font-bold whitespace-pre-line">
                {tip.title}
              </h4>
              <p className="text-xs">{tip.summary}</p>
              <details className="group pt-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold [&::-webkit-details-marker]:hidden">
                  Leer píldora
                  <span aria-hidden className="text-xl leading-none">
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">−</span>
                  </span>
                </summary>
                <p className="mt-3 text-xs leading-relaxed">{tip.body}</p>
                {tip.source && (
                  <a
                    href={tip.source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs underline-offset-4"
                  >
                    {tip.source.label} <ArrowUpRight aria-hidden className="size-3.5" />
                  </a>
                )}
              </details>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
