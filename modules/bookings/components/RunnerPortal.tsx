import Link from "next/link";
import { Flag } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/modules/accounts";
import { firstName } from "../utils/bookingDisplay";
import { buildTimeline, isTripFinished } from "../utils/runnerBookings";
import type { RunnerPortalState } from "../utils/runnerPortal";
import { BookingOverview, BookingPackage, BookingPayments, WhatsAppLink } from "./BookingOverview";
import { PortalHeader } from "./PortalHeader";
import { RaceSelector } from "./RaceSelector";
import { TripTimeline } from "./TripTimeline";
import { TripUpdates } from "./TripUpdates";

/** Whole `/mis-carreras` body: the page redirects `unauthenticated` before rendering it. */
export function RunnerPortal({ state }: { state: Exclude<RunnerPortalState, { status: "unauthenticated" }> }) {
  const shortName = firstName(state.name);
  // The page's only h1.
  const title = state.status !== "error" && shortName ? `Hola, ${shortName}.` : "Mis carreras";

  return (
    <>
      <PortalHeader name={state.name} />
      <main className="px-[5%] pt-8 pb-14 text-primary md:px-[6%] lg:pt-12">
        <p className="mb-2 text-xs font-bold tracking-[0.2em] uppercase">Mis carreras</p>
        <h1 className="display-title text-4xl leading-none lg:text-6xl">{title}</h1>
        <PortalBody state={state} />
      </main>
    </>
  );
}

function PortalBody({ state }: { state: Exclude<RunnerPortalState, { status: "unauthenticated" }> }) {
  if (state.status === "unverified") {
    return (
      <Alert role="status" className="mt-8 max-w-xl">
        <AlertTitle>Verifica tu correo para ver tus carreras.</AlertTitle>
        <AlertDescription>Cierra sesión y vuelve a ingresar: te enviaremos un código.</AlertDescription>
        <div className="mt-3 w-fit">
          <SignOutButton redirectTo="/cuenta" />
        </div>
      </Alert>
    );
  }

  if (state.status === "error") {
    return (
      <Alert variant="destructive" className="mt-8 max-w-xl">
        <AlertDescription>No pudimos cargar tus carreras. Inténtalo de nuevo en unos minutos.</AlertDescription>
        <Link href="/mis-carreras" className={cn(buttonVariants({ variant: "outline" }), "mt-3 w-fit")}>
          Reintentar
        </Link>
      </Alert>
    );
  }

  const { data, email, today } = state;
  const selected = data.selected;
  if (!selected) {
    return (
      <Empty className="mt-8 border border-primary/30">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Flag aria-hidden />
          </EmptyMedia>
          <EmptyTitle className="text-lg text-primary">Aún no tienes carreras registradas.</EmptyTitle>
          <EmptyDescription>Cuando el equipo registre tu reserva con <span className="break-all">{email}</span>, la verás aquí.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/#destinos" className={buttonVariants()}>
            Explorar experiencias
          </Link>
          <WhatsAppLink text="Hola, tengo una consulta sobre mis carreras." />
        </EmptyContent>
      </Empty>
    );
  }

  const cancelled = selected.status === "cancelled";
  // Desktop: the overview spans both columns; the timeline fills the main column and its last `1fr` row
  // absorbs its height so the side column (updates, package, payments, contact) stacks without gaps.
  // A cancelled booking has neither timeline nor updates, so it stays a single column.
  const side = cancelled ? undefined : "lg:col-start-2";
  return (
    <>
      <div className="mt-6">
        <RaceSelector bookings={data.bookings} selectedId={selected.id} today={today} />
      </div>
      <div
        className={cn(
          "mt-8 grid grid-cols-[minmax(0,1fr)] gap-10",
          !cancelled && "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-rows-[auto_auto_auto_auto_auto_1fr] lg:gap-x-16",
        )}
      >
        <BookingOverview detail={selected} today={today} className="lg:col-span-full" />
        {!cancelled && (
          <>
            <TripUpdates updates={selected.updates} className={side} />
            <TripTimeline
              timeline={buildTimeline(selected, today)}
              finished={isTripFinished(selected.trip, today)}
              className="lg:col-start-1 lg:row-[2/-1]"
            />
          </>
        )}
        <BookingPackage detail={selected} className={side} />
        <BookingPayments detail={selected} className={side} />
        <p className={cn("text-sm font-bold", side)}>
          ¿Dudas? <WhatsAppLink text={`Hola, tengo una consulta sobre mi reserva de ${selected.trip.title}.`} />
        </p>
      </div>
    </>
  );
}
