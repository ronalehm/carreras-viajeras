import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TripContent } from "../utils/trips";

const CHIP_BAR_COUNT = 22;

/** Decorative timing-chip barcode on the bib's bottom strip. */
function ChipBars() {
  return (
    <div aria-hidden className="flex h-10 items-center justify-center gap-0.75 bg-highlight">
      {Array.from({ length: CHIP_BAR_COUNT }, (_, i) => (
        <span
          key={i}
          className={cn(
            "block h-4.5 w-0.75 bg-white/75",
            (i + 1) % 3 === 0 && "w-1.5",
            (i + 1) % 4 === 0 && "h-2.5",
          )}
        />
      ))}
    </div>
  );
}

const PIN_HOLE =
  "absolute top-3.5 size-3 rounded-full bg-night shadow-[inset_0_2px_3px_rgb(0_0_0/0.4)]";

/** The trip's key facts as a race bib: pinned on load, still with prefers-reduced-motion. */
export function TripFacts({ trip }: { trip: TripContent }) {
  const stubs: { label: string; value: ReactNode; note?: ReactNode }[] = [
    {
      label: "La carrera",
      value: trip.raceDate,
      note: (
        <a
          href={trip.officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-medium whitespace-nowrap text-primary underline underline-offset-4"
        >
          Ver anuncio oficial <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
      ),
    },
    { label: "Salida", value: trip.route, note: trip.routeNote },
    {
      label: "Al contado",
      value: (
        <>
          {trip.prices.cash}{" "}
          <span className="font-sans text-xs font-medium whitespace-nowrap [font-stretch:normal]">/ corredor</span>
        </>
      ),
    },
    { label: "Primer equipo", value: trip.capacity, note: trip.capacityNote },
  ];

  return (
    <section
      aria-label="Datos del viaje"
      className="relative mx-auto w-full max-w-90 -rotate-3 overflow-hidden rounded-xl bg-background text-primary shadow-[0_30px_60px_-20px_rgb(1_20_60/0.55)] animate-in fill-mode-both fade-in slide-in-from-top-10 -spin-in-6 delay-150 duration-800 ease-out motion-reduce:animate-none lg:max-w-110"
    >
      <span aria-hidden className={cn(PIN_HOLE, "left-3.5")} />
      <span aria-hidden className={cn(PIN_HOLE, "right-3.5")} />
      <p className="flex justify-between gap-4 bg-primary px-9 pt-5.5 pb-4.5 text-sm font-semibold text-primary-foreground">
        <span>Maratón de Santiago</span>
        <span>Preventa</span>
      </p>
      <p className="px-8 pt-3 pb-1 text-center display-title text-[120px] leading-[0.9] font-black lg:text-[150px]">
        42<span className="ml-1.5 text-[0.36em] font-extrabold">K</span>
      </p>
      <dl className="grid grid-cols-2 border-t-2 border-dashed border-primary/20">
        {stubs.map(({ label, value, note }) => (
          <div
            key={label}
            className="flex flex-col gap-0.5 border-dashed border-primary/20 px-5 py-3.5 odd:border-r-2 [&:nth-child(-n+2)]:border-b-2"
          >
            <dt className="text-xs text-asphalt">{label}</dt>
            <dd className="font-display text-xl leading-tight font-extrabold [font-stretch:75%] xl:text-[22px]">
              {value}
            </dd>
            {note && <dd className="text-[11px] leading-snug text-asphalt">{note}</dd>}
          </div>
        ))}
      </dl>
      <ChipBars />
    </section>
  );
}
