import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTripPrice } from "@/modules/trips";
import type { BookingStatus, CrmBookingListItem } from "../types/bookings.types";
import { BOOKING_STATUS_LABELS, SIMULATED_BOOKING_LABEL } from "../utils/bookingDisplay";

const STATUS_VARIANTS = { pending: "secondary", confirmed: "default", cancelled: "outline" } as const;

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{BOOKING_STATUS_LABELS[status]}</Badge>;
}

/** Demo-checkout booking: never a real sale. Renders nothing for a real booking. */
export function SimulatedBookingBadge({ simulated, className }: { simulated: boolean; className?: string }) {
  if (!simulated) return null;
  return <Badge variant="destructive" className={className}>{SIMULATED_BOOKING_LABEL}</Badge>;
}

const COLUMNS = ["Participante", "Viaje", "Paquete", "Estado", "Total", "Pagado", "Saldo", "Cuenta"];

export function BookingTable({ bookings, filtered }: { bookings: CrmBookingListItem[]; filtered: boolean }) {
  if (bookings.length === 0) {
    return (
      <p className="text-muted-foreground">
        {filtered ? "Ningún resultado para esos filtros." : "Aún no hay reservas. Crea la primera con «Nueva reserva»."}
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((title) => <TableHead key={title}>{title}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {bookings.map((booking) => (
          <TableRow key={booking.id}>
            <TableCell>
              <Link href={`/crm/reservas/${booking.id}`} className="font-medium underline-offset-4 hover:underline">
                {booking.participantName}
              </Link>
              <p className="text-sm text-muted-foreground">{booking.participantEmail}</p>
            </TableCell>
            <TableCell>{booking.trip.title}</TableCell>
            <TableCell>{booking.packageLabel}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1.5">
                <BookingStatusBadge status={booking.status} />
                <SimulatedBookingBadge simulated={booking.simulated} />
              </div>
            </TableCell>
            <TableCell>{formatTripPrice(booking.totalUsd)}</TableCell>
            <TableCell>{formatTripPrice(booking.paidUsd)}</TableCell>
            <TableCell>
              {formatTripPrice(booking.balanceUsd)}
              {booking.paymentInReview && <Badge variant="outline" className="ml-1.5">Pago en revisión</Badge>}
            </TableCell>
            <TableCell>{booking.linked ? "Vinculada" : "Sin vincular"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
