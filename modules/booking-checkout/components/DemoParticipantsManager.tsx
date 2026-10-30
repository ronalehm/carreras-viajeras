"use client";

import { startTransition, useActionState, useRef, type FormEvent } from "react";
import { ConfirmActionButton, type ConfirmActionState } from "@/components/shared/ConfirmActionButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import type { CheckoutStatus, DemoParticipant } from "../services/demoParticipants.service";

type ParticipantAction = (previous: ConfirmActionState, formData: FormData) => Promise<ConfirmActionState>;
type Props = {
  participants: DemoParticipant[];
  checkoutStatus: CheckoutStatus;
  grantAction: ParticipantAction;
  revokeAction: ParticipantAction;
};
const INITIAL: ConfirmActionState = { status: "idle" };
const STATUS_LABELS: Record<CheckoutStatus, string> = {
  off: "apagado", demo: "demo (Stripe TEST)", test: "test", live: "live",
};

export function DemoParticipantsManager({ participants, checkoutStatus, grantAction, revokeAction }: Props) {
  const active = participants.filter(participant => !participant.revokedAt);
  const revoked = participants.filter(participant => participant.revokedAt);
  return <Card size="sm" aria-labelledby="demo-checkout-title">
    <CardHeader>
      <CardTitle id="demo-checkout-title">Demo de checkout</CardTitle>
      <CardDescription>
        En modo demo solo las cuentas activas de esta lista ven y usan el checkout, con Stripe TEST y reservas marcadas como simuladas.
      </CardDescription>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={checkoutStatus === "demo" ? "default" : "secondary"}>Checkout: {STATUS_LABELS[checkoutStatus]}</Badge>
        {checkoutStatus !== "demo" && <span className="text-muted-foreground">La lista solo tiene efecto con el modo demo activo.</span>}
      </p>
    </CardHeader>
    <CardContent className="grid gap-6">
      <GrantForm action={grantAction} />
      <section className="grid gap-2" aria-label="Participantes activos">
        <h2 className="text-sm font-medium">Activos ({active.length})</h2>
        {active.length === 0 ? <p className="text-sm text-muted-foreground">No hay participantes activos.</p> : <ParticipantTable rows={active} renderAction={participant =>
          <ConfirmActionButton action={revokeAction} fields={{ userId: participant.userId }} label="Dar de baja" title="Dar de baja de la demo"
            description={`${participant.email} dejará de ver el checkout de demostración en su siguiente petición.`} confirmLabel="Dar de baja" variant="destructive" />} />}
      </section>
      {revoked.length > 0 && <section className="grid gap-2" aria-label="Participantes dados de baja">
        <h2 className="text-sm font-medium">Dados de baja ({revoked.length})</h2>
        <ParticipantTable rows={revoked} renderAction={participant =>
          <ConfirmActionButton action={grantAction} fields={{ email: participant.email, note: participant.note ?? "" }} label="Dar de alta de nuevo" title="Dar de alta de nuevo"
            description={`${participant.email} volverá a ver el checkout de demostración. El alta quedará a tu nombre.`} confirmLabel="Dar de alta" variant="outline" />} />
      </section>}
    </CardContent>
  </Card>;
}

function GrantForm({ action }: { action: ParticipantAction }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useActionState(async (_: ConfirmActionState, data: FormData) => {
    const result = await action(INITIAL, data);
    if (result.status === "success") ref.current?.reset();
    return result;
  }, INITIAL);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending) { const data = new FormData(event.currentTarget); startTransition(() => submit(data)); }
  }
  return <form ref={ref} aria-label="Alta de participante" noValidate onSubmit={onSubmit} className="grid gap-4">
    <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div className="grid gap-2"><Label htmlFor="demo-participant-email">Correo verificado de la cuenta</Label><Input id="demo-participant-email" name="email" type="email" autoComplete="off" required /></div>
      <div className="grid gap-2"><Label htmlFor="demo-participant-note">Nota (opcional)</Label><Input id="demo-participant-note" name="note" maxLength={200} /></div>
      <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Dar de alta"}</Button>
    </fieldset>
    {state.status !== "idle" && <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-sm text-destructive" : "text-sm"}>{state.message}</p>}
  </form>;
}

function ParticipantTable({ rows, renderAction }: { rows: DemoParticipant[]; renderAction: (participant: DemoParticipant) => React.ReactNode }) {
  return <Table>
    <TableHeader><TableRow>
      <TableHead>Correo</TableHead><TableHead>Nota</TableHead><TableHead>Alta por</TableHead><TableHead>Alta</TableHead><TableHead>Baja</TableHead><TableHead><span className="sr-only">Acción</span></TableHead>
    </TableRow></TableHeader>
    <TableBody>{rows.map(participant => <TableRow key={participant.userId}>
      <TableCell>{participant.email}</TableCell>
      <TableCell className="whitespace-normal">{participant.note ?? "—"}</TableCell>
      <TableCell>{participant.grantedByEmail}</TableCell>
      <TableCell>{formatDateTime(participant.grantedAt)}</TableCell>
      <TableCell>{participant.revokedAt ? formatDateTime(participant.revokedAt) : "—"}</TableCell>
      <TableCell className="text-right">{renderAction(participant)}</TableCell>
    </TableRow>)}</TableBody>
  </Table>;
}
