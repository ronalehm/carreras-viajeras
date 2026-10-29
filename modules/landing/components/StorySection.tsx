import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function StorySection() {
  return (
    <section
      id="experiencia"
      className="grid items-center gap-10 bg-sky px-[6%] py-18 text-primary sm:px-[8%] md:grid-cols-[1.15fr_1fr] md:gap-[7%] lg:py-28"
    >
      <figure className="relative m-0 aspect-4/3 overflow-hidden rounded-2xl">
        <Image
          src="/images/story-runners.webp"
          alt="Runners compartiendo después de correr en Santiago, imagen ilustrativa generada con IA"
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
        />
        <figcaption className="absolute bottom-4 left-4 rounded-full bg-night/85 px-3.5 py-1.5 text-sm font-semibold text-primary-foreground sm:bottom-5 sm:left-5">
          Corre. Viaja. Conecta.
        </figcaption>
      </figure>
      <div>
        <p className="mb-4 text-sm font-semibold text-asphalt">Más que una carrera</p>
        <h2 className="mb-6 display-title text-display-section">
          Vuelves con
          <br />
          una historia.
        </h2>
        <p className="mb-7 max-w-[60ch] text-base leading-relaxed text-asphalt sm:text-lg">
          Otra ciudad. Una misma pasión.
          <br />
          Tu próxima meta, con runners de Perú.
        </p>
        <Link
          href="/viajes/maraton-santiago-2027"
          className="inline-flex items-center gap-1 text-base font-semibold underline decoration-highlight decoration-2 underline-offset-[6px]"
        >
          Descubre el viaje <ArrowUpRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  );
}
