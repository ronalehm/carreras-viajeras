import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TRIPS } from "../utils/trips";

export function PackageSection() {
  const trip = TRIPS[0];
  const tripHref = `/viajes/${trip.slug}`;

  return (
    <section
      id="paquete"
      aria-labelledby="package-title"
      className="mx-[4%] my-10 overflow-hidden rounded-md border border-primary/20 bg-background text-primary sm:my-14"
    >
      <div className="grid md:grid-cols-[1fr_1.15fr]">
        <div className="relative isolate flex min-h-52 items-end bg-primary md:min-h-133">
          <Image
            src={trip.image}
            alt={trip.imageAlt}
            fill
            sizes="(min-width: 768px) 46vw, 100vw"
            className="-z-20 object-cover"
          />
          <div className="absolute inset-0 -z-10 bg-linear-to-b from-primary/5 from-40% to-primary/85" />
          <span className="p-6 text-xs font-bold tracking-[0.15em] whitespace-pre-line text-primary-foreground sm:p-8 sm:text-sm">
            {trip.coverLabel}
          </span>
        </div>

        <div className="px-[7%] py-7 sm:py-9 lg:px-[9%] lg:py-11">
          <p className="mb-4 text-xs font-bold tracking-[0.12em]">
            TU PRÓXIMA GRAN HISTORIA · PREVENTA
          </p>
          <h2
            id="package-title"
            className="mb-6 font-heading text-5xl leading-none font-bold tracking-tight lg:text-6xl"
          >
            Tú corres.
            <br />
            El viaje, juntos.
          </h2>
          <ul
            aria-label="Beneficios principales"
            className="mb-6 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs md:max-lg:grid-cols-1"
          >
            {trip.highlights.map((highlight) => (
              <li key={highlight}>
                <span aria-hidden>✓ </span>
                {highlight}
              </li>
            ))}
          </ul>
          <p>
            <strong className="block text-4xl leading-tight font-bold tracking-tight lg:text-5xl">
              {trip.prices.cash}
            </strong>
            <span className="mt-1 block text-xs">al contado · por corredor</span>
          </p>
          <p className="mt-3 mb-6 text-xs leading-relaxed">
            {trip.prices.installmentsTotal} total en cuotas{" "}
            <span aria-hidden className="mx-1.5">
              ·
            </span>{" "}
            Reserva con {trip.prices.reservation}
          </p>
          <Link
            href={tripHref}
            className={cn(
              buttonVariants(),
              "h-auto w-full gap-1.5 rounded-sm px-6 py-4 text-sm font-bold shadow-[inset_0_-4px_0_var(--highlight)] sm:max-w-88",
            )}
          >
            Quiero correr Santiago <ArrowUpRight aria-hidden />
          </Link>
          <p className="mt-4 max-w-88 text-xs leading-relaxed">{trip.disclaimer}</p>
        </div>
      </div>

      <Link
        href={tripHref}
        className="flex min-h-15 items-center justify-center gap-1.5 border-t border-primary/20 px-5 py-4 text-sm font-semibold no-underline hover:underline"
      >
        Ver más: paquete completo <ArrowUpRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}
