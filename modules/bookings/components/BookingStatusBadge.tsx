import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "../types/bookings.types";
import { BOOKING_STATUS_LABELS } from "../utils/bookingDisplay";

const STATUS_VARIANTS = { pending: "secondary", confirmed: "default", cancelled: "outline" } as const;

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{BOOKING_STATUS_LABELS[status]}</Badge>;
}
