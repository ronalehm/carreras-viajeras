import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [{ href: "/contacto", label: "Contacto" }];

/** Brand mark shared by header and footer; inherits the text color. */
export function SiteBrand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Carreras Viajeras, inicio"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-extrabold tracking-tight no-underline",
        className,
      )}
    >
      <ArrowUpRight aria-hidden className="size-9 stroke-[1.5] sm:size-11" />
      <span>
        CARRERAS
        <br />
        VIAJERAS
      </span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-20 items-center justify-between gap-4 bg-background px-[5%] text-primary shadow-sm md:h-24 md:px-[6%]">
      <SiteBrand />
      <nav aria-label="Principal" className="hidden gap-8 text-sm md:flex">
        {NAV_LINKS.map(({ href, label }) => (
          <Link key={href} href={href} className="no-underline hover:underline">
            {label}
          </Link>
        ))}
      </nav>
      <Link
        href="/contacto"
        className={cn(
          buttonVariants(),
          "h-auto gap-1.5 rounded-sm px-4 py-3 text-xs font-bold sm:text-sm",
        )}
      >
        Quiero correr <ArrowUpRight aria-hidden />
      </Link>
    </header>
  );
}
