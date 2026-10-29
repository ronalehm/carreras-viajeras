import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCrmAccess } from "@/modules/accounts";
import { ContentForm } from "@/modules/content";
import { CrmPageHeader } from "@/components/shared/CrmPageHeader";

export const metadata: Metadata = { title: "Nuevo contenido" };
export default async function NewContentPage() {
  const access = await getCrmAccess("content.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") return <section><h1 className="text-xl font-semibold">Contenidos</h1><p>No tienes permiso para gestionar contenidos.</p></section>;
  return <section className="grid gap-7"><CrmPageHeader title="Crear borrador" section="Contenidos" description="Guardar prepara el contenido; publicarlo es una acción posterior." /><ContentForm /></section>;
}
