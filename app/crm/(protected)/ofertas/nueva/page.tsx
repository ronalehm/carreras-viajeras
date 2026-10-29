import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCrmAccess } from "@/modules/accounts";
import { listCampaigns } from "@/modules/crm";
import { listTrips, OfferForm, tripScopeFor } from "@/modules/trips";

export const metadata: Metadata = { title: "Nueva oferta" };

export default async function NewOfferPage() {
  const access = await getCrmAccess("offers.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Nueva oferta</h1>
        <p className="text-muted-foreground">
          No tienes permiso para gestionar ofertas. Si lo necesitas, pídeselo a un administrador.
        </p>
      </section>
    );
  }
  const [trips, campaigns] = await Promise.all([
    listTrips(tripScopeFor(access.user)),
    listCampaigns(),
  ]);
  const openTrips = trips.filter((trip) => trip.status !== "archived");
  // Campaigns carry their trip's slug (unique), not its id: compose the options with the trip list.
  const tripIdBySlug = new Map(openTrips.map((trip) => [trip.slug, trip.id]));
  const campaignOptions = campaigns.flatMap((campaign) => {
    const tripId = tripIdBySlug.get(campaign.trip.slug);
    return campaign.status === "active" && tripId
      ? [{ id: campaign.id, label: `${campaign.name} (${campaign.code})`, tripId }]
      : [];
  });

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Nueva oferta</h1>
      <OfferForm
        tripOptions={openTrips.map((trip) => ({ id: trip.id, title: trip.title }))}
        campaignOptions={campaignOptions}
      />
    </section>
  );
}
