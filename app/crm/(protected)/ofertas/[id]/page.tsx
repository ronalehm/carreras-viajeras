import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { can } from "@/lib/auth/permissions";
import { getTodayDate } from "@/lib/dates";
import { getCrmAccess } from "@/modules/accounts";
import {
  getCurrentExchangeRate,
  getOfferById,
  OfferDetails,
  OfferForm,
  OfferTable,
} from "@/modules/trips";

export const metadata: Metadata = { title: "Oferta" };

export default async function OfferPage({ params }: PageProps<"/crm/ofertas/[id]">) {
  const access = await getCrmAccess("offers.view");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Oferta</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar ofertas. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const { id } = await params;
  // getOfferById returns null for a non-UUID id without a query.
  const [offer, exchangeRate] = await Promise.all([getOfferById(id), getCurrentExchangeRate()]);
  if (!offer) notFound();
  const canManage = can(access.user.staffRoles, "offers.manage");
  // Only a draft is editable, and only with offers.manage; the action checks both again.
  const editable = canManage && offer.status === "draft";
  const today = getTodayDate();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold break-words">{offer.name}</h1>
        <p className="text-muted-foreground">{offer.trip.title}</p>
      </div>
      <OfferDetails offer={offer} exchangeRate={exchangeRate} canManage={canManage} today={today} />
      {editable && <OfferForm offer={offer} />}
      <section aria-labelledby="offer-history-title" className="flex flex-col gap-4">
        <h2 id="offer-history-title" className="text-lg font-semibold">Historial de esta oferta</h2>
        <OfferTable offers={offer.history} today={today} />
      </section>
      {/* The edit form already has its own "Volver a ofertas" link. */}
      {!editable && (
        <div>
          <Link href="/crm/ofertas" className={buttonVariants({ variant: "ghost" })}>Volver a ofertas</Link>
        </div>
      )}
    </section>
  );
}
