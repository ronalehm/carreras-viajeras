import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function MobileCta() {
  return (
    <Link
      href="/contacto?destino=santiago-2027"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t-4 border-highlight bg-primary px-[6%] pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-sm font-bold text-primary-foreground no-underline shadow-lg sm:hidden"
    >
      <span>
        US$1,499 <small className="text-xs font-normal">al contado</small>
      </span>
      <span className="flex items-center gap-1">
        Quiero información <ArrowUpRight aria-hidden className="size-4" />
      </span>
    </Link>
  );
}
