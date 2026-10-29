import { SignOutButton } from "@/modules/accounts";
import { SiteBrand } from "@/modules/landing";

/** Signed-in header of the runner portal: SiteHeader is static and shows "Ingresar / Registrarse". */
export function PortalHeader({ name }: { name?: string }) {
  return (
    <header className="flex min-h-22 items-center justify-between gap-3 border-b border-primary/10 bg-background px-[5%] py-4 text-primary md:px-[6%] lg:h-26 lg:py-0">
      <SiteBrand />
      <div className="flex min-w-0 items-center gap-3">
        {name && <span className="hidden truncate text-sm font-bold sm:inline">{name}</span>}
        <SignOutButton redirectTo="/cuenta" />
      </div>
    </header>
  );
}
