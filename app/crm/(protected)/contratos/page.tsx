import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCrmAccess } from "@/modules/accounts";
import { ContractManager, isContractSandboxEnabled, listContractVersions, createContractAction, updateContractAction, approveContractAction } from "@/modules/contracts";

export const metadata: Metadata = { title: "Contratos" };

export default async function ContractsPage() {
  const access = await getCrmAccess("offers.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") return <section><h1 className="text-xl font-semibold">Contratos</h1><p className="text-muted-foreground">No tienes permiso para gestionar contratos.</p></section>;
  if (!isContractSandboxEnabled()) return <section><h1 className="text-xl font-semibold">Contratos</h1><p className="text-muted-foreground">El checkout de pruebas está deshabilitado.</p></section>;
  return <ContractManager contracts={await listContractVersions()} createAction={createContractAction} updateAction={updateContractAction} approveAction={approveContractAction} />;
}
