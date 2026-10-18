import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRIPS } from "../utils/trips";

const santiago = TRIPS[0];

const DESTINATIONS = [
  {
    href: `/viajes/${santiago.slug}`,
    image: "/images/santiago.jpg",
    alt: "Vista de Santiago y la cordillera",
    label: "CHILE · DESTINO PRINCIPAL",
    name: "Santiago",
    note: `Preventa / ${santiago.prices.cash} al contado · ${santiago.prices.installmentsTotal} en cuotas`,
    action: "Quiero información",
    active: true,
  },
  {
    href: "/contacto?destino=panama",
    image: "/images/panama.jpg",
    alt: "Vista de la bahía y los edificios de Ciudad de Panamá",
    label: "PANAMÁ · EN EXPLORACIÓN",
    name: "Panamá",
    note: "Sin carrera, fecha ni precio confirmados",
    action: "Avísame cuando esté disponible",
    active: false,
  },
  {
    href: "/contacto?destino=medellin",
    image: "/images/medellin.jpg",
    alt: "Vista de Medellín entre montañas",
    label: "COLOMBIA · EN EXPLORACIÓN",
    name: "Medellín",
    note: "Sin carrera, fecha ni precio confirmados",
    action: "Avísame cuando esté disponible",
    active: false,
  },
];

export function DestinationsSection() {
  return (
    <section
      id="destinos"
      aria-labelledby="destinations-title"
      className="px-[6%] py-10 text-primary sm:px-[8%] sm:py-14"
    >
      <div className="mb-6 gap-8 sm:mb-9 sm:flex sm:items-end sm:justify-between">
        <div>
          <p className="mb-6 text-xs font-bold tracking-[0.2em]">ESTO RECIÉN EMPIEZA</p>
          <h2
            id="destinations-title"
            className="font-heading text-5xl leading-none font-bold tracking-tight"
          >
            Más ciudades.
            <br />
            Más razones para correr.
          </h2>
        </div>
        <p className="mt-4 text-xs leading-relaxed sm:mt-0">
          Elige tu próximo destino.
          <br />
          Te contamos cuando haya novedades.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {DESTINATIONS.map(({ href, image, alt, label, name, note, action, active }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col overflow-hidden rounded-sm border border-primary/25 no-underline transition-shadow hover:border-primary hover:shadow-lg hover:shadow-primary/10",
              active ? "bg-primary text-primary-foreground" : "bg-background",
            )}
          >
            <Image
              src={image}
              alt={alt}
              width={1000}
              height={620}
              sizes="(min-width: 768px) 30vw, 100vw"
              className="h-55 w-full shrink-0 object-cover md:h-45 lg:h-52"
            />
            <span className="flex flex-1 flex-col items-start p-5.5 md:p-4 lg:p-6">
              <span className="text-xs tracking-widest">{label}</span>
              <strong className="my-3 flex items-center gap-1 font-heading text-4xl leading-none font-bold lg:text-5xl">
                {name} <ArrowUpRight aria-hidden className="size-8" />
              </strong>
              <small className="text-xs leading-relaxed">{note}</small>
              <span className="mt-auto flex items-center gap-1 border-b-3 border-highlight pt-5 pb-1.5 text-xs font-bold">
                {action} <ArrowUpRight aria-hidden className="size-3.5" />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
