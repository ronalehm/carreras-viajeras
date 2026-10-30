import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatTripPrice } from "@/modules/trips";
import { voidPaymentAction } from "../actions/payments.actions";
import type { BookingBalance, CrmPayment, StripePayment } from "../types/bookings.types";
import { formatShortDate, STRIPE_PAYMENT_CONCEPT } from "../utils/bookingDisplay";

type PaymentTableProps = {
  payments: CrmPayment[]; // manual payments, voided ones included
  balance: BookingBalance; // common balance: totals and the Stripe settlements
  editable: boolean; // false for a cancelled booking: no "Anular"
};

const COLUMNS = ["Fecha", "Concepto", "Importe", "Registrado por", "Estado"];

// Stripe settlements are listed from the balance itself (source "Stripe"): no manual copy exists.
// "En revisión" ones are marked for reconciliation and never count as paid.
type Row =
  | { source: "manual"; payment: CrmPayment }
  | { source: "stripe"; payment: StripePayment; review: boolean };

export function PaymentTable({ payments, balance, editable }: PaymentTableProps) {
  const rows: Row[] = [
    ...payments.map((payment): Row => ({ source: "manual", payment })),
    ...balance.stripePayments.map((payment): Row => ({ source: "stripe", payment, review: false })),
    ...balance.needsReview.map((payment): Row => ({ source: "stripe", payment, review: true })),
  ].sort((a, b) => a.payment.paidOn.localeCompare(b.payment.paidOn));
  const reviewUsd = balance.needsReview.reduce((sum, payment) => sum + payment.amountUsd, 0);
  const totals = [
    ["Total acordado", formatTripPrice(balance.totalUsd)],
    ["Pagado", formatTripPrice(balance.paidUsd)],
    balance.balanceUsd < 0 ? ["Saldo a favor", formatTripPrice(-balance.balanceUsd)] : ["Saldo", formatTripPrice(balance.balanceUsd)],
    ...(reviewUsd > 0 ? [["En revisión (no suma)", formatTripPrice(reviewUsd)]] : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Aún no hay pagos registrados.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((title) => <TableHead key={title}>{title}</TableHead>)}
              {editable && <TableHead><span className="sr-only">Acciones</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => row.source === "stripe" ? (
              <TableRow key={row.payment.id} className={cn(row.review && "text-muted-foreground")}>
                <TableCell>{formatShortDate(row.payment.paidOn)}</TableCell>
                <TableCell>{STRIPE_PAYMENT_CONCEPT}</TableCell>
                <TableCell>{formatTripPrice(row.payment.amountUsd)}</TableCell>
                <TableCell>Stripe</TableCell>
                <TableCell>{row.review ? <Badge variant="destructive">En revisión</Badge> : "Vigente"}</TableCell>
                {editable && <TableCell />}
              </TableRow>
            ) : (
              <TableRow key={row.payment.id} className={cn(row.payment.voided && "text-muted-foreground")}>
                <TableCell>{formatShortDate(row.payment.paidOn)}</TableCell>
                <TableCell>{row.payment.concept}</TableCell>
                <TableCell className={cn(row.payment.voided && "line-through")}>{formatTripPrice(row.payment.amountUsd)}</TableCell>
                <TableCell>{row.payment.recordedByEmail}</TableCell>
                <TableCell>{row.payment.voided ? <Badge variant="outline">Anulado</Badge> : "Vigente"}</TableCell>
                {editable && (
                  <TableCell className="text-right">
                    {!row.payment.voided && (
                      <ConfirmActionButton
                        action={voidPaymentAction} fields={{ paymentId: row.payment.id }}
                        label="Anular" title={`¿Anular el pago de ${formatTripPrice(row.payment.amountUsd)}?`}
                        confirmLabel="Anular pago" variant="destructive"
                        description="Dejará de contar en el saldo. No se puede deshacer."
                      />
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {totals.map(([term, value]) => (
          <div key={term} className="flex gap-2">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
