import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/modules/landing";
import { getPublishedPostBySlug, NewsArticle } from "@/modules/content";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const post = await getPublishedPostBySlug((await params).slug);
    return post ? { title: post.title, description: post.summary } : { title: "Publicación no encontrada" };
  } catch { return { title: "Noticias no disponibles" }; }
}
export default async function NewsArticlePage({ params }: Props) {
  let post: Awaited<ReturnType<typeof getPublishedPostBySlug>>;
  try { post = await getPublishedPostBySlug((await params).slug); }
  catch {
    return <><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-16 text-primary"><h1 className="text-2xl font-semibold">No pudimos cargar la publicación.</h1><p className="mt-4">Inténtalo de nuevo más tarde.</p><Link href="/noticias" className="mt-5 inline-block underline">Volver a noticias</Link></main><SiteFooter /></>;
  }
  if (!post) notFound();
  return <><SiteHeader /><main><NewsArticle post={post} /></main><SiteFooter /></>;
}
