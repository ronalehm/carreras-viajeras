"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ReferralCode({ code, url }: { code: string; url?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setStatus("copied"); }
    catch { setStatus("error"); }
  }
  return <div className="grid gap-3">
    <Label htmlFor={`referral-${code}`}>Código de referido</Label>
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
      <Input id={`referral-${code}`} readOnly value={code} className="min-w-0 font-mono" />
      <Button variant="outline" type="button" onClick={() => copy(code)}>Copiar código</Button>
    </div>
    {url && <><Label htmlFor={`referral-link-${code}`}>Enlace para compartir</Label><Input id={`referral-link-${code}`} readOnly value={url} /><Button variant="outline" type="button" className="w-fit" onClick={() => copy(url)}>Copiar enlace</Button></>}
    {status === "copied" && <p role="status" className="text-sm">Copiado.</p>}
    {status === "error" && <p role="alert" className="text-sm text-destructive">No se pudo copiar. Selecciona el texto y cópialo a mano.</p>}
  </div>;
}
