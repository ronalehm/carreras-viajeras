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

const SLIDES: Slide[] = [
  {
    image: "/images/hero-santiago.webp",
    alt: "Corredores en la línea de partida de la Maratón de Santiago",
    label: "Maratón de Santiago",
    status: "Maratón de Santiago 42K",
    dot: "Ver Santiago 42K",
    title: (
      <>
        Tu próxima meta es la <br className="max-sm:hidden" />
        maratón de Santiago.
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
        El viaje, juntos.
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
        se comparte.
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

/** `children` is fixed content beside the slides (the trip bib); it doesn't change with the slide. */
export function HeroCarousel({ children }: { children?: ReactNode }) {
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
      className="relative isolate overflow-hidden bg-night text-primary-foreground"
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
      {/* lg min-height fits the tallest slide (4 display lines + CTA + dots) so slides don't shift the page. */}
      <div className="grid gap-10 px-[6%] pt-9 pb-12 sm:px-[8%] sm:pt-20 sm:pb-16 lg:min-h-[max(calc(min(37vw,37rem)+19.5rem),calc(100svh-6.5rem))] lg:grid-cols-[1.25fr_0.75fr] lg:items-end lg:gap-12 lg:py-20">
        <div>
          <div
            className="flex flex-col justify-end max-lg:min-h-72 sm:max-lg:min-h-96"
            onFocus={() => setFocused(true)}
            onBlur={(e) => setFocused(e.currentTarget.contains(e.relatedTarget))}
          >
            {SLIDES.map((slide, i) => {
              const Heading = i === 0 ? "h1" : "h2";
              return (
                // The slide is not positioned: its photo fills the whole hero, behind the bib too.
                <article
                  key={slide.image}
                  role="group"
                  aria-roledescription="lámina"
                  aria-label={`${i + 1} de ${SLIDES.length}: ${slide.label}`}
                  hidden={i !== index}
                >
                  {/* Flat duotone: the photo's luminosity over --night. */}
                  <div className="absolute inset-0 -z-10 opacity-55 mix-blend-luminosity motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700">
                    <Image
                      src={slide.image}
                      alt={slide.alt}
                      fill
                      sizes="100vw"
                      preload={i === 0}
                      className="object-cover object-[60%_center] sm:object-center"
                    />
                  </div>
                  <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700">
                    <Heading className="m-0 display-title text-display-hero">{slide.title}</Heading>
                    {slide.cta && (
                      <div className="mt-8">
                        <Link
                          href={slide.cta.href}
                          className={cn(
                            buttonVariants(),
                            "h-auto gap-2 rounded-full bg-highlight px-6 py-3.5 text-sm font-semibold text-night hover:bg-background sm:text-base",
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

          <div role="group" aria-label="Elegir lámina" className="mt-6 -ml-1 flex gap-1">
            {SLIDES.map((slide, i) => (
              <button
                key={slide.dot}
                type="button"
                aria-label={slide.dot}
                aria-current={i === index ? "true" : undefined}
                onClick={() => show(i)}
                className="relative h-10 w-9.5 cursor-pointer after:absolute after:top-4.5 after:left-1 after:h-0.75 after:w-7.5 after:rounded-full after:bg-primary-foreground/50 aria-[current=true]:after:bg-highlight"
              />
            ))}
          </div>
        </div>

        {children}
      </div>
      <div aria-hidden className="absolute inset-0 -z-10 bg-night/35" />

      <button
        type="button"
        onClick={() => setOverride({ reducedMotion, paused: !paused })}
        className="sr-only rounded-full bg-background px-4 py-2 text-sm font-bold text-primary focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:right-4 focus-visible:z-10"
      >
        {paused ? "Reanudar cambio automático de láminas" : "Detener cambio automático de láminas"}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </section>
  );
}
