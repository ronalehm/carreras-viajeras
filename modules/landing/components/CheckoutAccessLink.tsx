"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCheckoutAccess } from "../hooks/useCheckoutAccess";

/**
 * "Continuar al checkout" block of the static trip page. The server decides per request whether
 * this visitor may continue; while that answer loads, or if it fails, nothing is shown.
 */
export function CheckoutAccessLink({ href, description, className }: {
  href: string; description: string; className?: string;
}) {
  const { data: available } = useCheckoutAccess();
  if (available !== true) return null;
  return (
    <div className={cn("rounded-xl border border-primary/15 bg-background p-5", className)}>
      <p className="font-semibold">¿Ya registraste tus datos y tienes una cuenta verificada?</p>
      <p className="mt-1 text-sm">{description}</p>
      <Link href={href} className={cn(buttonVariants(), "mt-4 inline-flex rounded-full px-5 py-3")}>
        Continuar al checkout <ArrowUpRight aria-hidden />
      </Link>
    </div>
  );
}
