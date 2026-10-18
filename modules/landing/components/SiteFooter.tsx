import Image from "next/image";
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

const MAZ_METRICS = [
  { value: "+15", label: "Maratones internacionales" },
  { value: "+500", label: "Runners" },
];

export function SiteFooter() {
  return (
    <>
      <aside
        aria-label="Respaldo de MAZ Producciones"
        className="mx-[6%] mb-5 grid gap-5 border-y border-primary/25 bg-background py-6 text-primary sm:mx-[8%] sm:mb-8 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr] lg:gap-x-6"
      >
        <div className="flex items-center gap-4 sm:col-span-2 sm:gap-5 lg:col-span-1">
          <Image
            src="/images/maz-producciones.webp"
            alt="MAZ Producciones"
            width={480}
            height={350}
            className="h-16 w-24 object-contain sm:h-20 sm:w-30"
          />
          <div>
            <p className="mb-2 text-xs font-bold tracking-widest">
              EL EQUIPO DETRÁS DEL VIAJE
            </p>
            <h2 className="mb-1 text-base font-semibold sm:text-lg">
              Una unidad de MAZ PRODUCCIONES.
            </h2>
            <p className="text-xs">Carreras Viajeras · Corre. Viaja. Conecta.</p>
          </div>
        </div>
        <div
          role="group"
          aria-label="Trayectoria de MAZ Producciones en 2025"
          className="grid grid-cols-2 gap-5"
        >
          {MAZ_METRICS.map(({ value, label }) => (
            <div key={value}>
              <strong className="block text-3xl leading-tight font-bold tracking-tight">
                {value}
              </strong>
              <span className="mt-1 block text-xs">{label}</span>
              <small className="text-xs">2025</small>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-primary/20 pt-3 text-xs sm:col-span-2">
          <strong className="font-semibold">
            MAZ PRODUCCIONES Y MAZ S.A.C. · RUC 20601664934
          </strong>
          <p>Datos de trayectoria 2025 proporcionados por MAZ Producciones.</p>
        </div>
      </aside>

      <footer
        id="pie"
        className="bg-primary px-[6%] pt-12 pb-8 text-primary-foreground max-sm:pb-28"
      >
        <div className="flex flex-wrap items-center justify-between gap-6 border-b border-primary-foreground/20 pb-9">
          <SiteBrand />
          <span className="text-xs max-sm:hidden">Corre. Viaja. Conecta.</span>
          <div role="group" aria-label="Redes sociales" className="flex gap-2.5 max-sm:w-full">
            {SOCIAL_LINKS.map(({ href, glyph, label }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-md border border-primary-foreground/25 px-3 py-2.5 text-lg no-underline hover:bg-primary-foreground/10 max-sm:flex-1"
              >
                <span aria-hidden>{glyph}</span>
                <span className="text-xs">{label}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="grid gap-6 py-9 md:grid-cols-2 md:gap-10">
          <div>
            <h2 className="mb-4 text-sm font-bold">Información del proveedor</h2>
            <dl className="text-xs">
              {PROVIDER_INFO.map(([term, detail]) => (
                <div key={term} className="mb-2">
                  <dt>{term}</dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h2 className="mb-4 text-sm font-bold">Atención al consumidor</h2>
            <p className="rounded-sm border border-highlight/50 p-3 text-xs">
              <span aria-hidden>▤ </span>Libro de Reclamaciones
            </p>
            <p className="mt-2 text-xs">Pendiente de habilitación</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-primary-foreground/20 pt-5 text-xs sm:flex-row sm:justify-between">
          <small className="text-xs">
            © 2026 Carreras Viajeras · Marca independiente del organizador de la carrera.
          </small>
          <small className="text-xs">
            Vista privada de demostración. Sin ventas ni pagos habilitados.
          </small>
        </div>
      </footer>
    </>
  );
}
