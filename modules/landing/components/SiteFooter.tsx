import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AnalyticsPreferencesButton } from "@/components/shared/AnalyticsPreferencesButton";
import { SiteBrand } from "./SiteHeader";

const SOCIAL_LINKS = [
  {
    href: "https://www.facebook.com/p/Carreas-Viajeras-by-MAZ-Producciones-61594941239310/",
    glyph: "f",
    label: "Facebook",
  },
  { href: "https://www.instagram.com/carrerasviajeras/", glyph: "◎", label: "Instagram" },
];

const PROVIDER_INFO = [
  ["Nombre comercial", "Carreras Viajeras"],
  ["Razón social", "MAZ PRODUCCIONES Y MAZ S.A.C."],
  ["RUC", "20601664934"],
  ["Domicilio y contacto", "Pendientes de completar"],
];

export function SiteFooter() {
  return (
    <footer id="pie" className="bg-night px-[6%] pt-14 pb-10 text-primary-foreground sm:px-[8%]">
      <div className="flex flex-wrap items-center justify-between gap-6 border-b border-primary-foreground/20 pb-10">
        <SiteBrand variant="mark" className="[&_img]:rounded-full" />
        <span className="display-title text-3xl leading-none max-sm:hidden">Corre. Viaja. Conecta.</span>
        <div role="group" aria-label="Redes sociales" className="flex gap-2.5 max-sm:w-full">
          {SOCIAL_LINKS.map(({ href, glyph, label }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary-foreground/30 px-4 py-2 text-lg no-underline hover:bg-primary-foreground/10 max-sm:flex-1"
            >
              <span aria-hidden>{glyph}</span>
              <span className="text-sm font-medium">{label}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="grid gap-10 py-10 md:grid-cols-3">
        <div>
          <h2 className="mb-5 display-title text-2xl leading-none">Información del proveedor</h2>
          <dl className="grid gap-3 text-sm">
            {PROVIDER_INFO.map(([term, detail]) => (
              <div key={term}>
                <dt className="text-primary-foreground/70">{term}</dt>
                <dd>{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h2 className="mb-5 display-title text-2xl leading-none">Tu comunidad</h2>
          <Link
            href="/cuenta"
            className="inline-flex items-center gap-1 text-sm font-semibold underline decoration-highlight decoration-2 underline-offset-[6px]"
          >
            Ingresar / Registrarse <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        </div>
        <div>
          <h2 className="mb-5 display-title text-2xl leading-none">Atención al consumidor</h2>
          <p className="rounded-xl border border-primary-foreground/30 px-4 py-3 text-sm">
            <span aria-hidden>▤ </span>Libro de Reclamaciones
          </p>
          <p className="mt-2 text-sm text-primary-foreground/70">Pendiente de habilitación</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-primary-foreground/20 pt-6 text-sm text-primary-foreground/70 sm:flex-row sm:justify-between">
        <small className="text-sm">
          © 2026 Carreras Viajeras · Marca independiente del organizador de la carrera.
        </small>
        <small className="text-sm">
          Vista privada de demostración. Sin ventas ni pagos habilitados.
        </small>
        <AnalyticsPreferencesButton className="text-sm" />
      </div>
    </footer>
  );
}
