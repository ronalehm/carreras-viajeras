import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function StorySection() {
  return (
    <section
      id="experiencia"
      className="grid items-center gap-6 px-[6%] py-8 text-primary sm:px-[8%] sm:py-12 md:grid-cols-[1.15fr_1fr] md:gap-[7%]"
    >
      <figure className="relative m-0 aspect-3/2 overflow-hidden rounded-md">
        <Image
          src="/images/story-runners.webp"
          alt="Runners compartiendo después de correr en Santiago, imagen ilustrativa generada con IA"
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-[65%] bottom-0 bg-linear-to-b from-transparent to-primary/60"
        />
        <figcaption className="absolute bottom-4.5 left-4.5 text-xs font-bold tracking-[0.2em] text-primary-foreground sm:bottom-6 sm:left-6">
          CORRE. VIAJA. CONECTA.
        </figcaption>
      </figure>
      <div>
        <p className="mb-4 text-xs font-bold tracking-[0.2em]">MÁS QUE UNA CARRERA</p>
        <h2 className="mb-5 font-heading text-5xl leading-none font-bold tracking-tight lg:text-6xl">
          Vuelves con
          <br />
          una historia.
        </h2>
        <p className="mb-5 text-sm leading-loose">
          Otra ciudad. Una misma pasión.
          <br />
          Tu próxima meta, con runners de Perú.
        </p>
        <Link
          href="/viajes/maraton-santiago-2027"
          className="inline-flex items-center gap-1 text-sm font-bold underline underline-offset-[5px]"
        >
          Descubre el viaje <ArrowUpRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  );
}
