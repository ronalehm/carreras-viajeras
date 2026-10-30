import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MobileMenu } from "./MobileMenu";

const NAV_LINKS = [
  { href: "/#paquete", label: "Próxima maratón" },
  { href: "/#comunidad", label: "Comunidad" },
  { href: "/#noticias", label: "Noticias" },
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
          src="/images/logo-cv.webp"
          alt="Carreras Viajeras by MAZ Producciones"
          width={640}
          height={213}
          priority
          className="h-8 w-auto sm:h-10 lg:h-11"
        />
      ) : (
        <Image
          src="/images/isotipo-cv.webp"
          alt="Carreras Viajeras"
          width={256}
          height={256}
          className="size-11 sm:size-14"
        />
      )}
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 flex min-h-22 flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b border-primary/10 bg-background px-[5%] py-4 text-primary sm:gap-x-4 md:px-[6%] lg:h-26 lg:flex-nowrap lg:py-0">
      <SiteBrand />
      {/* md–lg: the nav takes its own row so it never collides with the actions. */}
      <nav
        aria-label="Principal"
        className="order-last hidden w-full gap-7 text-sm font-medium whitespace-nowrap md:flex lg:order-none lg:w-auto lg:gap-6 xl:gap-9"
      >
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="py-2 no-underline decoration-highlight decoration-2 underline-offset-8 hover:underline focus-visible:underline"
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center justify-end gap-1.5 sm:gap-3">
        {/* Both open the Clerk panel of /cuenta, which signs in or creates the account. */}
        <Link
          href="/cuenta#imagen-login"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-auto rounded-full border-primary px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-primary hover:bg-primary hover:text-primary-foreground sm:px-4.5 sm:py-3 sm:text-sm",
          )}
        >
          Ingresar
        </Link>
        <Link
          href="/cuenta#imagen-login"
          className={cn(
            buttonVariants(),
            "h-auto gap-1.5 rounded-full px-3 py-2.5 text-xs font-semibold whitespace-nowrap sm:px-4.5 sm:py-3 sm:text-sm",
          )}
        >
          Registrarse <ArrowUpRight aria-hidden className="max-sm:hidden" />
        </Link>
        <MobileMenu links={NAV_LINKS} />
      </div>
    </header>
  );
}
