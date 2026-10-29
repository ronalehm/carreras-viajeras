import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ManagedPostListItem } from "../types/content.types";
import { CONTENT_CATEGORY_LABELS, CONTENT_STATUS_LABELS, formatContentDate } from "../utils/contentDisplay";

export function ContentTable({ posts }: { posts: ManagedPostListItem[] }) {
  return <Table><TableHeader><TableRow><TableHead>Publicación</TableHead><TableHead>Categoría</TableHead><TableHead>Estado</TableHead><TableHead>Último cambio</TableHead></TableRow></TableHeader>
    <TableBody>{posts.length === 0 && <TableRow><TableCell colSpan={4}>Todavía no hay publicaciones. Crea un borrador para comenzar.</TableCell></TableRow>}
      {posts.map((post) => <TableRow key={post.id}>
        <TableCell><Link href={`/crm/contenidos/${post.id}`} className="font-medium underline underline-offset-4">{post.title}</Link></TableCell>
        <TableCell>{CONTENT_CATEGORY_LABELS[post.category]}</TableCell>
        <TableCell>{CONTENT_STATUS_LABELS[post.status]}{post.hasPendingChanges ? " · Cambios pendientes" : ""}</TableCell>
        <TableCell>{formatContentDate(post.updatedAt)}</TableCell>
      </TableRow>)}
    </TableBody></Table>;
}
