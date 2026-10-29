import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTripPrice } from "@/modules/trips";
import type { CrmBookingListItem } from "../types/bookings.types";
import { BookingStatusBadge } from "./BookingStatusBadge";

// Requirement 9: a negative balance is shown as credit.
function formatBalance(balanceUsd: number): string {
  return balanceUsd < 0 ? `Saldo a favor ${formatTripPrice(-balanceUsd)}` : formatTripPrice(balanceUsd);
}

const COLUMNS = ["Participante", "Viaje", "Paquete", "Estado", "Total", "Pagado", "Saldo", "Cuenta"];

export function BookingTable({ bookings, filtered }: { bookings: CrmBookingListItem[]; filtered: boolean }) {
  if (bookings.length === 0) {
    return (
      <p className="text-muted-foreground">
        {filtered ? "Ningún resultado para ese viaje." : "Aún no hay reservas. Crea la primera con «Nueva reserva»."}
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
            <TableCell><BookingStatusBadge status={booking.status} /></TableCell>
            <TableCell>{formatTripPrice(booking.totalUsd)}</TableCell>
            <TableCell>{formatTripPrice(booking.paidUsd)}</TableCell>
            <TableCell>{formatBalance(booking.totalUsd - booking.paidUsd)}</TableCell>
            <TableCell>{booking.linked ? "Vinculada" : "Sin vincular"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
