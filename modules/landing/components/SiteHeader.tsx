import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MobileMenu } from "./MobileMenu";

const NAV_LINKS = [
  { href: "/#paquete", label: "Próxima maratón" },
  { href: "/#comunidad", label: "Comunidad" },
  { href: "/#blog", label: "Blog" },
  { href: "/contacto", label: "Contacto" },
];

/**
 * Brand mark shared by header and footer.
 * `logo` renders the official lockup (blue + green on white), for light backgrounds.
 * `mark` renders the circular isotipo, for backgrounds where the logo would lose contrast.
 */
export function SiteBrand({
  className,
  variant = "logo",
}: {
  className?: string;
  variant?: "logo" | "mark";
}) {
  return (
    <Link
      href="/"
      aria-label="Carreras Viajeras, inicio"
      className={cn("flex items-center gap-2 no-underline", className)}
    >
      {variant === "logo" ? (
        <Image
          src="/images/logo-cv.png"
          alt="Carreras Viajeras by MAZ Producciones"
          width={2172}
          height={724}
          priority
          className="h-8 w-auto sm:h-10 lg:h-11"
        />
      ) : (
        <Image
          src="/images/isotipo-cv.png"
          alt="Carreras Viajeras"
          width={1254}
          height={1254}
          className="size-11 sm:size-14"
        />
      )}
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 flex min-h-20 flex-wrap items-center justify-between gap-x-2 gap-y-2 sm:gap-x-4 bg-background px-[5%] py-3 text-primary shadow-sm md:px-[6%] lg:h-24 lg:flex-nowrap lg:py-0">
      <SiteBrand />
      {/* md–lg: the nav takes its own row so it never collides with the actions. */}
      <nav
        aria-label="Principal"
        className="order-last hidden w-full gap-6 text-sm md:flex lg:order-none lg:w-auto lg:gap-8"
      >
        {NAV_LINKS.map(({ href, label }) => (
          <Link key={href} href={href} className="no-underline hover:underline">
            {label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center justify-end gap-1 sm:gap-3">
        <Link
          href="/cuenta"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-auto gap-1.5 rounded-sm border-primary px-2.5 py-2.5 text-xs font-bold whitespace-nowrap text-primary hover:bg-primary hover:text-primary-foreground sm:px-3.5 sm:py-3",
          )}
        >
          Ingresar / Registrarse <ArrowUpRight aria-hidden className="max-sm:hidden" />
        </Link>
        <Link
          href="/contacto"
          className={cn(
            buttonVariants(),
            "h-auto gap-1.5 rounded-sm px-3 py-2.5 text-xs font-bold max-md:hidden sm:px-4 sm:py-3 sm:text-sm",
          )}
        >
          Quiero correr <ArrowUpRight aria-hidden />
        </Link>
        <MobileMenu links={NAV_LINKS} />
      </div>
    </header>
  );
}
