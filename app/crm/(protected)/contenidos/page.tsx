import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCrmAccess } from "@/modules/accounts";
import { ContentTable, listManagedPosts } from "@/modules/content";
import { CrmPageHeader } from "@/components/shared/CrmPageHeader";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Contenidos" };
export default async function ContentAdminPage() {
  const access = await getCrmAccess("content.manage");
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") return <section><h1 className="text-xl font-semibold">Contenidos</h1><p>No tienes permiso para gestionar contenidos.</p></section>;
  const posts = await listManagedPosts();
  return <section className="grid gap-7">
    <CrmPageHeader title="Noticias y contenidos" section="Administración" description="Prepara borradores y publica novedades para la web." />
    <div><Link href="/crm/contenidos/nuevo" className={buttonVariants()}>Crear borrador</Link></div>
    <ContentTable posts={posts} />
    {posts.length === 200 && <p className="text-sm text-muted-foreground">Se muestran las 200 publicaciones modificadas más recientemente.</p>}
  </section>;
}
