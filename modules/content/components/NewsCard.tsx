import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { PublicPost } from "../types/content.types";
import { CONTENT_CATEGORY_LABELS, formatContentDate } from "../utils/contentDisplay";

export function NewsCard({ post }: { post: PublicPost }) {
  return <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-primary/15 bg-background">
    {post.imageUrl && <div className="relative aspect-video"><Image src={post.imageUrl} alt={post.imageAlt ?? ""} fill sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw" className="object-cover" /></div>}
    <div className="flex flex-1 flex-col gap-4 p-6">
      <p className="text-sm text-asphalt">{CONTENT_CATEGORY_LABELS[post.category]} · <time dateTime={post.publishedAt.toISOString()}>{formatContentDate(post.publishedAt)}</time></p>
      <h3 className="display-title text-3xl leading-tight text-primary"><Link href={`/noticias/${post.slug}`} className="decoration-highlight underline-offset-4 hover:underline">{post.title}</Link></h3>
      <p className="text-sm leading-relaxed text-asphalt">{post.summary}</p>
      <Link href={`/noticias/${post.slug}`} className="mt-auto inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4" aria-label={`Leer: ${post.title}`}>Leer publicación <ArrowUpRight aria-hidden className="size-4" /></Link>
    </div>
  </article>;
}
