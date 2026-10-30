import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCrmAccess } from "@/modules/accounts";
import {
  DemoParticipantsManager, getCheckoutStatus, grantDemoParticipantAction, listDemoParticipants, revokeDemoParticipantAction,
} from "@/modules/booking-checkout";
import { ContractManager, listContractVersions, createContractAction, updateContractAction, approveContractAction } from "@/modules/contracts";

export const metadata: Metadata = { title: "Contratos" };

export default async function ContractsPage() {
  const access = await getCrmAccess("offers.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") return <section><h1 className="text-xl font-semibold">Contratos</h1><p className="text-muted-foreground">No tienes permiso para gestionar contratos.</p></section>;
  const [contracts, participants] = await Promise.all([listContractVersions(), listDemoParticipants()]);
  return <div className="flex flex-col gap-8">
    <ContractManager contracts={contracts} createAction={createContractAction} updateAction={updateContractAction} approveAction={approveContractAction} />
    <DemoParticipantsManager participants={participants} checkoutStatus={getCheckoutStatus()} grantAction={grantDemoParticipantAction} revokeAction={revokeDemoParticipantAction} />
  </div>;
}
