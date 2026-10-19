"use client";

import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Slide = {
  image: string;
  alt: string;
  /** Slide aria-label ("N de 3: …"). */
  label: string;
  /** Announced by role="status" on manual changes. */
  status: string;
  /** Dot button aria-label. */
  dot: string;
  title: ReactNode;
  cta?: { href: string; label: string };
};

const em = (text: string) => <em className="text-highlight italic">{text}</em>;

const SLIDES: Slide[] = [
  {
    image: "/images/hero-santiago.webp",
    alt: "Corredores en la línea de partida de la Maratón de Santiago",
    label: "Maratón de Santiago",
    status: "Maratón de Santiago 42K",
    dot: "Ver Santiago 42K",
    title: (
      <>
        Tu próxima meta es la <br />
        maratón de {em("Santiago.")}
      </>
    ),
    cta: { href: "/contacto?destino=santiago-2027", label: "Quiero vivir esta carrera" },
  },
  {
    image: "/images/hero-patagonia.webp",
    alt: "Corredores en un sendero de montaña de la Patagonia",
    label: "Tu paquete corredor",
    status: "Tu paquete corredor",
    dot: "Ver paquete corredor",
    title: (
      <>
        Tú corres. <br />
        El viaje, {em("juntos.")}
      </>
    ),
    cta: { href: "#paquete", label: "Descubrir el paquete" },
  },
  {
    image: "/images/hero-meta.webp",
    alt: "Corredor cruzando la meta de la Maratón de Santiago",
    label: "La comunidad viajera",
    status: "La comunidad viajera",
    dot: "Ver comunidad",
    title: (
      <>
        La meta se cruza. <br />
        La historia <br />
        {em("se comparte.")}
      </>
    ),
    cta: { href: "#comunidad", label: "Explorar la comunidad" },
  },
];

const AUTOPLAY_MS = 6500;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

export function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState("");
  // Server snapshots return true: no autoplay until hydrated.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
  const pageHidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => true);
  // A manual pause/resume holds until the motion preference changes, then paused follows it again.
  const [override, setOverride] = useState<{ reducedMotion: boolean; paused: boolean } | null>(null);
  const paused = override?.reducedMotion === reducedMotion ? override.paused : reducedMotion;
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (paused || focused || pageHidden) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [index, paused, focused, pageHidden]);

  function show(next: number) {
    const i = (next + SLIDES.length) % SLIDES.length;
    setIndex(i);
    setStatus(`Lámina ${i + 1} de ${SLIDES.length}: ${SLIDES[i].status}`);
  }

  return (
    <section
      id="inicio"
      aria-roledescription="carrusel"
      aria-label="Descubre Carreras Viajeras"
      className="relative bg-primary text-primary-foreground"
    >
      <div
        onFocus={() => setFocused(true)}
        onBlur={(e) => setFocused(e.currentTarget.contains(e.relatedTarget))}
        onTouchStart={(e) => {
          const t = e.changedTouches[0];
          touchStart.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          if (!touchStart.current) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - touchStart.current.x;
          const dy = t.clientY - touchStart.current.y;
          touchStart.current = null;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) show(index + (dx < 0 ? 1 : -1));
        }}
      >
        {SLIDES.map((slide, i) => {
          const Heading = i === 0 ? "h1" : "h2";
          return (
            <article
              key={slide.image}
              role="group"
              aria-roledescription="lámina"
              aria-label={`${i + 1} de ${SLIDES.length}: ${slide.label}`}
              hidden={i !== index}
              className="relative isolate flex min-h-[76svh] items-center overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700 max-sm:max-h-190 sm:min-h-165"
            >
              <Image
                src={slide.image}
                alt={slide.alt}
                fill
                sizes="100vw"
                preload={i === 0}
                className="-z-20 object-cover object-[60%_center] sm:object-center"
              />
              <div className="absolute inset-0 -z-10 bg-linear-to-r from-primary/60 via-primary/30 to-transparent" />
              <div className="w-full px-[6%] pt-15 pb-20 sm:px-[8%] sm:py-20">
                <Heading className="m-0 max-w-3xl font-heading text-5xl leading-none font-bold tracking-tight text-shadow-lg text-shadow-primary/50 sm:text-6xl lg:text-7xl xl:text-8xl">
                  {slide.title}
                </Heading>
                {slide.cta && (
                  <div className="mt-7">
                    <Link
                      href={slide.cta.href}
                      className={cn(
                        buttonVariants(),
                        "h-auto gap-8 rounded-sm px-5 py-3.5 text-xs font-bold shadow-[inset_0_-4px_0_var(--highlight)] sm:px-6 sm:py-4 sm:text-sm",
                      )}
                    >
                      {slide.cta.label} <ArrowUpRight aria-hidden />
                    </Link>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div role="group" aria-label="Elegir lámina" className="flex gap-1 px-[6%] sm:px-[8%]">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.dot}
            type="button"
            aria-label={slide.dot}
            aria-current={i === index ? "true" : undefined}
            onClick={() => show(i)}
            className="relative h-10 w-9.5 cursor-pointer after:absolute after:top-4.5 after:left-1 after:h-0.75 after:w-7.5 after:bg-primary-foreground/50 aria-[current=true]:after:bg-highlight"
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setOverride({ reducedMotion, paused: !paused })}
        className="sr-only rounded-sm bg-background px-3 py-2 text-sm font-bold text-primary focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:right-4 focus-visible:z-10"
      >
        {paused ? "Reanudar cambio automático de láminas" : "Detener cambio automático de láminas"}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </section>
  );
}
