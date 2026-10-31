"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCheckoutAccess } from "../hooks/useCheckoutAccess";

/**
 * "Reservar mi lugar" block of the static trip page. The server decides per request whether
 * this visitor may continue; while that answer loads, or if it fails, nothing is shown.
 */
export function CheckoutAccessLink({ href, description, className }: {
  href: string; description: string; className?: string;
}) {
  const { data: available } = useCheckoutAccess();
  if (available !== true) return null;
  // The page's main action for a verified runner: dark card with the green CTA so it stands out
  // right after the price, where the decision is made.
  return (
    <div className={cn("rounded-2xl bg-night p-6 text-primary-foreground shadow-lg sm:p-7", className)}>
      <p className="text-lg font-semibold">¿Ya registraste tus datos y tienes una cuenta verificada?</p>
      <p className="mt-1 text-sm text-primary-foreground/80">{description}</p>
      <Link
        href={href}
        className={cn(
          buttonVariants(),
          "mt-5 h-auto w-full gap-2 rounded-full bg-highlight px-6 py-3.5 text-base font-semibold text-night hover:bg-background sm:w-auto",
        )}
      >
        Reservar mi lugar <ArrowUpRight aria-hidden />
      </Link>
    </div>
  );
}
