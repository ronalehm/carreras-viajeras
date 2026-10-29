import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/lib/auth/permissions";
import { formatDateTime, getTodayDate } from "@/lib/dates";
import { getCrmAccess } from "@/modules/accounts";
import {
  ExchangeRateForm,
  ExchangeRateTable,
  listExchangeRates,
  listOffers,
  OfferTable,
} from "@/modules/trips";

export const metadata: Metadata = { title: "Ofertas" };

export default async function OffersPage() {
  const access = await getCrmAccess("offers.view");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Ofertas</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar ofertas. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const canManage = can(access.user.staffRoles, "offers.manage");
  const [offers, rates] = await Promise.all([listOffers(), listExchangeRates()]);
  // listExchangeRates is newest first: its first row is the rate in force (same as getCurrentExchangeRate).
  const current = rates[0];

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Ofertas</h1>
          {canManage && (
            <Link href="/crm/ofertas/nueva" className={buttonVariants()}>Nueva oferta</Link>
          )}
        </div>
        <OfferTable offers={offers} today={getTodayDate()} />
      </div>
      <section aria-labelledby="exchange-rate-title" className="flex flex-col gap-6">
        <h2 id="exchange-rate-title" className="text-lg font-semibold">Tipo de cambio</h2>
        {current && (
          <Card size="sm" className="max-w-md">
            <CardHeader>
              <CardTitle>Tipo de cambio vigente</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <p className="text-lg font-semibold tabular-nums">S/ {current.usdPen} por US$ 1</p>
              <p className="text-sm text-muted-foreground">
                Fijado por {current.createdBy.email} el {formatDateTime(current.effectiveFrom)}
              </p>
            </CardContent>
          </Card>
        )}
        {canManage && <ExchangeRateForm />}
        <ExchangeRateTable rates={rates} />
      </section>
    </section>
  );
}
