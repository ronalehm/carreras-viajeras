import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCrmAccess } from "@/modules/accounts";
import { ContentForm, getManagedPostById } from "@/modules/content";
import { CrmPageHeader } from "@/components/shared/CrmPageHeader";

export const metadata: Metadata = { title: "Editar contenido" };
export default async function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getCrmAccess("content.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") return <section><h1 className="text-xl font-semibold">Contenidos</h1><p>No tienes permiso para gestionar contenidos.</p></section>;
  const post = await getManagedPostById((await params).id);
  if (!post) notFound();
  return <section className="grid gap-7"><CrmPageHeader title={post.title} section="Contenidos" description="Los cambios quedan en borrador hasta publicarlos expresamente." /><ContentForm post={post} /></section>;
}
