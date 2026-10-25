import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatTripPrice } from "@/modules/trips";
import { voidPaymentAction } from "../actions/payments.actions";
import type { CrmPayment } from "../types/bookings.types";
import { formatShortDate } from "../utils/bookingDisplay";

type PaymentTableProps = {
  payments: CrmPayment[];
  totalUsd: number;
  paidUsd: number; // non-voided payments only
  editable: boolean; // false for a cancelled booking: no "Anular"
};

const COLUMNS = ["Fecha", "Concepto", "Importe", "Registrado por", "Estado"];

export function PaymentTable({ payments, totalUsd, paidUsd, editable }: PaymentTableProps) {
  const balance = totalUsd - paidUsd;
  const totals = [
    ["Total acordado", formatTripPrice(totalUsd)],
    ["Pagado", formatTripPrice(paidUsd)],
    balance < 0 ? ["Saldo a favor", formatTripPrice(-balance)] : ["Saldo", formatTripPrice(balance)],
  ];

  return (
    <div className="flex flex-col gap-3">
      {payments.length === 0 ? (
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
            {payments.map((payment) => (
              <TableRow key={payment.id} className={cn(payment.voided && "text-muted-foreground")}>
                <TableCell>{formatShortDate(payment.paidOn)}</TableCell>
                <TableCell>{payment.concept}</TableCell>
                <TableCell className={cn(payment.voided && "line-through")}>{formatTripPrice(payment.amountUsd)}</TableCell>
                <TableCell>{payment.recordedByEmail}</TableCell>
                <TableCell>{payment.voided ? <Badge variant="outline">Anulado</Badge> : "Vigente"}</TableCell>
                {editable && (
                  <TableCell className="text-right">
                    {!payment.voided && (
                      <ConfirmActionButton
                        action={voidPaymentAction} fields={{ paymentId: payment.id }}
                        label="Anular" title={`¿Anular el pago de ${formatTripPrice(payment.amountUsd)}?`}
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
