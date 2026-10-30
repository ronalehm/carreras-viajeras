"use client";

import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ContractActionState, ContractVersion } from "../schemas/contracts.schema";

type ContractAction = (previous: ContractActionState, formData: FormData) => Promise<ContractActionState>;
type Props = { contracts: ContractVersion[]; createAction: ContractAction; updateAction: ContractAction; approveAction: ContractAction };
const INITIAL: ContractActionState = { status: "idle" };

export function ContractManager({ contracts, createAction, updateAction, approveAction }: Props) {
  return <section className="flex flex-col gap-6">
    <h1 className="text-xl font-semibold">Contratos</h1>
    <CreateContractForm action={createAction} />
    <div className="grid gap-4">{contracts.map(contract => <ContractCard key={contract.id} contract={contract} updateAction={updateAction} approveAction={approveAction} />)}</div>
    {contracts.length === 0 && <p className="text-muted-foreground">Aún no hay versiones de contrato.</p>}
  </section>;
}

function CreateContractForm({ action }: { action: ContractAction }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useActionState(async (_: ContractActionState, data: FormData) => {
    const result = await action(INITIAL, data);
    if (result.status === "success") ref.current?.reset();
    return result;
  }, INITIAL);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending) { const data = new FormData(event.currentTarget); startTransition(() => submit(data)); }
  }
  return <Card size="sm"><CardHeader><CardTitle>Nueva versión</CardTitle></CardHeader><CardContent>
    <form ref={ref} aria-label="Nuevo contrato" noValidate onSubmit={onSubmit} className="grid gap-4">
      <fieldset disabled={pending} className="grid gap-4">
        <Field label="Versión" name="versionKey" placeholder="viaje-2027-v1" />
        <Field label="Título" name="title" />
        <div className="grid gap-2"><Label htmlFor="contract-new-body">Texto del contrato</Label><Textarea id="contract-new-body" name="body" required minLength={20} maxLength={50000} rows={10} /></div>
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Crear borrador"}</Button>
      </fieldset>
      <ActionMessage state={state} />
    </form>
  </CardContent></Card>;
}

function ContractCard({ contract, updateAction, approveAction }: { contract: ContractVersion; updateAction: ContractAction; approveAction: ContractAction }) {
  const [title, setTitle] = useState(contract.title);
  const [body, setBody] = useState(contract.body);
  const [state, submit, pending] = useActionState(updateAction, INITIAL);
  const dirty = title !== contract.title || body !== contract.body;
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending && dirty) { const data = new FormData(event.currentTarget); data.set("id", contract.id); startTransition(() => submit(data)); }
  }
  return <Card size="sm"><CardHeader><CardTitle>{contract.title} · {contract.versionKey} · {contract.status === "approved" ? "Aprobado" : "Borrador"}</CardTitle></CardHeader><CardContent className="grid gap-4">
    {contract.status === "approved" ? <pre className="whitespace-pre-wrap break-words font-sans text-sm">{contract.body}</pre> : <>
      <form aria-label={"Editar " + contract.versionKey} noValidate onSubmit={onSubmit} className="grid gap-4">
        <fieldset disabled={pending} className="grid gap-4">
          <Field label="Título" name="title" value={title} onChange={e => setTitle(e.target.value)} />
          <div className="grid gap-2"><Label htmlFor={"contract-body-" + contract.id}>Texto del contrato</Label><Textarea id={"contract-body-" + contract.id} name="body" required minLength={20} maxLength={50000} rows={10} value={body} onChange={e => setBody(e.target.value)} /></div>
          <Button type="submit" disabled={!dirty || pending}>{pending ? "Guardando…" : "Guardar borrador"}</Button>
        </fieldset>
        <ActionMessage state={state} />
      </form>
      {!dirty && <ConfirmActionButton action={approveAction} fields={{ id: contract.id, documentHash: contract.reviewHash }} label="Aprobar versión" title="Aprobar contrato" description={`Se aprobará el texto guardado de ${contract.versionKey}. La versión aprobada quedará inmutable.`} confirmLabel="Aprobar texto guardado" variant="outline" />}
      <pre className="whitespace-pre-wrap break-words rounded-md border p-3 font-sans text-sm">{contract.body}</pre>
    </>}
  </CardContent></Card>;
}

function Field({ label, name, value, onChange, placeholder }: { label: string; name: string; value?: string; onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) {
  const id = "contract-" + name + (value === undefined ? "-new" : "-edit");
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} value={value} onChange={onChange} placeholder={placeholder} required /></div>;
}
function ActionMessage({ state }: { state: ContractActionState }) {
  if (state.status === "idle") return null;
  return <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-sm text-destructive" : "text-sm"}>{state.message}</p>;
}
