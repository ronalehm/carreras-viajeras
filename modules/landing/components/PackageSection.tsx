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
      className="grid items-center gap-10 bg-background px-[6%] py-18 text-primary sm:px-[8%] md:grid-cols-[0.9fr_1.1fr] md:gap-[6%] lg:py-30"
    >
      <figure className="relative m-0 aspect-4/5 overflow-hidden rounded-2xl bg-night max-md:max-h-[34rem]">
        <Image
          src={trip.image}
          alt={trip.imageAlt}
          fill
          sizes="(min-width: 768px) 42vw, 100vw"
          className="object-cover"
        />
        <figcaption className="absolute bottom-4 left-4 rounded-xl bg-night/85 px-4 py-3 display-title text-2xl leading-none whitespace-pre-line text-primary-foreground sm:bottom-5 sm:left-5 sm:text-3xl">
          {trip.coverLabel}
        </figcaption>
      </figure>

      <div>
        <p className="mb-4 text-sm font-semibold text-primary-foreground">Tu próxima gran historia · preventa</p>
        <h2 id="package-title" className="mb-8 display-title text-display-section text-primary">
          Tú corres.
          <br />
          El viaje, juntos.
        </h2>
        <ul
          aria-label="Beneficios principales"
          className="grid gap-x-8 text-base font-medium sm:grid-cols-2"
        >
          {trip.highlights.map((highlight) => (
            <li
              key={highlight}
              className="flex items-baseline gap-3 border-t border-primary/15 py-3.5"
            >
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-highlight" />
              {highlight}
            </li>
          ))}
        </ul>
        <div className="mt-9 flex flex-wrap items-end gap-x-7 gap-y-3">
          <strong className="display-title text-[80px] leading-[0.85] font-black lg:text-9xl text-primary">
            {trip.prices.cash}
          </strong>
          <p className="pb-1 text-base leading-relaxed text-primary-foreground sm:text-base">
            al contado · por corredor
            <br />
            {trip.prices.installmentsTotal} total en cuotas{" "}
            <span aria-hidden className="mx-1">
              ·
            </span>{" "}
            <span className="text-green-600 font-bold text-[24px]">Reserva con {trip.prices.reservation}</span>
          </p>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
          <Link
            href={tripHref}
            className={cn(
              buttonVariants(),
              "h-auto gap-2 rounded-full bg-highlight px-6 py-3.5 text-base font-semibold text-night hover:bg-highlight/85",
            )}
          >
            Quiero correr Santiago <ArrowUpRight aria-hidden />
          </Link>
          <Link
            href={tripHref}
            className="inline-flex items-center gap-1 text-sm font-semibold underline decoration-highlight decoration-2 underline-offset-[6px]"
          >
            Ver más: paquete completo <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        </div>
        <p className="mt-5 max-w-[60ch] text-sm leading-relaxed text-asphalt">{trip.disclaimer}</p>
      </div>
    </section>
  );
}
