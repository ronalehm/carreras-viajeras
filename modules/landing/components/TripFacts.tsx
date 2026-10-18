import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TripContent } from "../utils/trips";

export function TripFacts({ trip }: { trip: TripContent }) {
  const facts: { label: string; value: ReactNode; note: ReactNode }[] = [
    {
      label: "LA CARRERA",
      value: trip.raceDate,
      note: (
        <a
          href={trip.officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 underline underline-offset-4"
        >
          Ver anuncio oficial <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
      ),
    },
    { label: "TU PUNTO DE PARTIDA", value: trip.route, note: trip.routeNote },
    {
      label: "EL PAQUETE",
      value: (
        <>
          {trip.prices.cash} <span className="text-xs font-normal">/ corredor</span>
        </>
      ),
      note: "Preventa · al contado",
    },
    { label: "EL PRIMER EQUIPO", value: trip.capacity, note: trip.capacityNote },
  ];

  return (
    <section
      aria-label="Datos del viaje"
      className="grid grid-cols-2 gap-x-3 gap-y-6 border-b border-primary/25 px-[6%] py-6 text-primary md:grid-cols-4 md:gap-0 md:py-8"
    >
      {facts.map(({ label, value, note }, index) => (
        <div
          key={label}
          className={cn(
            "border-l pl-3 md:pl-7 md:first:border-0 md:first:pl-0",
            index % 2 === 0 ? "border-highlight/40" : "border-primary/25",
          )}
        >
          <small
            className={cn(
              "mb-1.5 block text-xs tracking-widest",
              index % 2 === 0 ? "text-highlight" : "text-primary",
            )}
          >
            {label}
          </small>
          <strong
            className={cn(
              "block text-base font-bold md:text-xl",
              index % 2 === 0 ? "text-highlight" : "text-primary",
            )}
          >
            {value}
          </strong>
          <span className="block text-xs">{note}</span>
        </div>
      ))}
    </section>
  );
}
