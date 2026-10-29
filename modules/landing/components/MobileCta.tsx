import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/** Bar height, shared by the fixed bar and its in-flow spacer so the page end is never covered. */
const BAR_HEIGHT = "h-[calc(3rem+env(safe-area-inset-bottom))]";

export function MobileCta() {
  return (
    <>
      {/* In-flow spacer: reserves the bar's height after the footer, only where the bar shows. */}
      <div aria-hidden className={`${BAR_HEIGHT} bg-night sm:hidden`} />
      <Link
        href="/contacto?destino=santiago-2027"
        className={`fixed inset-x-0 bottom-0 z-30 flex ${BAR_HEIGHT} items-center justify-between gap-3 bg-night/95 px-[5%] pb-[env(safe-area-inset-bottom)] text-primary-foreground no-underline shadow-[0_-10px_30px_-12px_color-mix(in_oklab,var(--night)_60%,transparent)] backdrop-blur-sm sm:hidden`}
      >
        <span className="flex items-baseline gap-1.5">
          <span className="display-title text-2xl leading-none">US$1,499</span>
          {" "}
          <small className="text-xs text-primary-foreground/75">al contado</small>
        </span>
        <span className="flex items-center gap-1 rounded-full bg-highlight px-4 py-2 text-sm font-semibold text-night">
          Quiero información <ArrowUpRight aria-hidden className="size-4" />
        </span>
      </Link>
    </>
  );
}
