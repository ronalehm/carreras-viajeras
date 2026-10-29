"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { saveContentAction, publishContentAction, unpublishContentAction, archiveContentAction } from "../actions/content.actions";
import { CONTENT_CATEGORY_LABELS, CONTENT_STATUS_LABELS } from "../utils/contentDisplay";
import type { ContentActionState, ManagedPost } from "../types/content.types";

const INITIAL: ContentActionState = { status: "idle" };
const FIELDS = [
  { name: "title", label: "Título", maxLength: 160 },
  { name: "slug", label: "Identificador de la URL", maxLength: 100 },
  { name: "summary", label: "Resumen", maxLength: 400, rows: 3 },
  { name: "body", label: "Contenido", maxLength: 30000, rows: 12 },
  { name: "imageUrl", label: "URL HTTPS de imagen (opcional)", maxLength: 2048 },
  { name: "imageAlt", label: "Descripción de la imagen", maxLength: 200 },
] as const;

export function ContentForm({ post }: { post?: ManagedPost }) {
  const [state, action, pending] = useActionState(saveContentAction, INITIAL);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;
  const archived = post?.status === "archived";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || archived) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }
  return (
    <div className="grid max-w-3xl gap-7">
      {post && <p role="status" className="text-sm text-muted-foreground">{CONTENT_STATUS_LABELS[post.status]}{post.hasPendingChanges ? " · Con cambios pendientes" : ""}. Guardar prepara una revisión; publicar la hace visible.</p>}
      <form noValidate onSubmit={submit} className="grid gap-5">
        {post && <><input type="hidden" name="id" value={post.id} /><input type="hidden" name="version" value={post.version} /></>}
        {state.status === "error" && <p role="alert" className="text-destructive">{state.message}</p>}
        <fieldset disabled={pending || archived} className="grid gap-5">
          <legend className="sr-only">Contenido editorial</legend>
          <div className="grid gap-2">
            <Label htmlFor="content-category">Categoría</Label>
            <NativeSelect id="content-category" name="category" defaultValue={values?.category ?? post?.draft.category ?? "news"}>
              {Object.entries(CONTENT_CATEGORY_LABELS).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
            </NativeSelect>
          </div>
          {FIELDS.map((field) => {
            const key = field.name;
            const locked = key === "slug" && !!post?.publishedAt;
            const props = { id: `content-${key}`, name: key, defaultValue: values?.[key] ?? post?.draft[key] ?? "", maxLength: field.maxLength,
              "aria-invalid": errors?.[key] ? true as const : undefined, "aria-describedby": errors?.[key] ? `content-${key}-error` : undefined };
            return <div className="grid gap-2" key={key}>
              <Label htmlFor={props.id}>{field.label}</Label>
              {"rows" in field ? <Textarea {...props} rows={field.rows} /> : <Input {...props} readOnly={locked} type={key === "imageUrl" ? "url" : "text"} />}
              {locked && <p className="text-sm text-muted-foreground">Fijo desde la primera publicación.</p>}
              {errors?.[key] && <p id={`content-${key}-error`} role="alert" className="text-sm text-destructive">{errors[key][0]}</p>}
            </div>;
          })}
          <p className="text-sm text-muted-foreground">El contenido se publica como texto. Separa los párrafos con una línea en blanco.</p>
          <Button type="submit">{pending ? "Guardando…" : "Guardar borrador"}</Button>
        </fieldset>
      </form>
      {post && !archived && !pending && <div className="flex flex-wrap gap-3" aria-label="Publicación del contenido">
        {(post.status !== "published" || post.hasPendingChanges) && <ConfirmActionButton action={publishContentAction} fields={{ id: post.id, version: String(post.version) }} label={post.status === "published" ? "Publicar cambios" : "Publicar"} title="Publicar contenido" description="La revisión guardada será visible para cualquier visitante de la web. Los cambios sin guardar no se publican." confirmLabel="Publicar" variant="outline" />}
        {post.status === "published" && <ConfirmActionButton action={unpublishContentAction} fields={{ id: post.id, version: String(post.version) }} label="Despublicar" title="Retirar de la web pública" description="La publicación dejará de aparecer en la portada, listado y detalle." confirmLabel="Despublicar" variant="outline" />}
        <ConfirmActionButton action={archiveContentAction} fields={{ id: post.id, version: String(post.version) }} label="Archivar" title="Archivar contenido" description="Se retira de la web y se conserva su historial. No podrás editarlo." confirmLabel="Archivar" variant="destructive" />
      </div>}
      <Link href="/crm/contenidos" className={buttonVariants({ variant: "outline" })}>Volver a contenidos</Link>
    </div>
  );
}
