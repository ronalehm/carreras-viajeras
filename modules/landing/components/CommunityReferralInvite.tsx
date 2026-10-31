"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowUpRight, Share2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRIMARY =
  "h-auto gap-2 rounded-full bg-highlight px-5 py-3 text-sm font-semibold text-night hover:bg-background sm:text-base";
const SECONDARY =
  "h-auto gap-2 rounded-full border-primary-foreground/35 bg-transparent px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:text-base";

/**
 * Presentation only: the referral invitation of the community block.
 * The home page stays static; the session is read on the client. Until Clerk confirms a session,
 * the visitor version is shown. The linked pages keep their own guards.
 */
export function CommunityReferralInvite() {
  const { isLoaded, isSignedIn } = useUser();

  if (isLoaded && isSignedIn) {
    return (
      <>
        <h3 className="mb-3 display-title text-3xl leading-none lg:text-4xl">
          Invita a un amigo y suma estrellas.
        </h3>
        <div>
          <p className="mb-5 max-w-[60ch] text-sm leading-relaxed text-primary-foreground/75 sm:text-base">
            Comparte tu código con quien quieras correr. Cuando tu amigo confirme su reserva y
            registre su primer pago, recibirás estrellas para canjear por premios.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/cuenta/perfil#referidos" className={cn(buttonVariants(), PRIMARY)}>
              <Share2 aria-hidden /> Compartir mi código
            </Link>
            <Link
              href="/cuenta/perfil#beneficios"
              className={cn(buttonVariants({ variant: "outline" }), SECONDARY)}
            >
              Ver premios y condiciones
            </Link>
          </div>
          <p className="mt-4 text-xs text-primary-foreground/60">
            Las estrellas y los premios siguen las condiciones vigentes publicadas en tu perfil.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h3 className="mb-3 display-title text-3xl leading-none lg:text-4xl">
        Gana estrellas para tu próxima carrera.
      </h3>
      <div>
        <p className="mb-5 max-w-[60ch] text-sm leading-relaxed text-primary-foreground/75 sm:text-base">
          Invita a tus amigos a correr contigo. Cada amigo que reserve su viaje te acerca a tu
          próximo premio.
        </p>
        <Link href="/cuenta#imagen-login" className={cn(buttonVariants(), PRIMARY)}>
          Crear mi cuenta e invitar <ArrowUpRight aria-hidden />
        </Link>
      </div>
    </>
  );
}
