"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
  WHATSAPP_NUMBER,
  buildInquiryMessage,
  buildWhatsAppUrl,
  parseDestinationId,
  type DestinationId,
} from "../utils/inquiry";

const FIELD_CLASS = "h-12 rounded-sm border-primary/25 px-3 text-sm md:text-sm";
const FIELD_LABEL_CLASS = "flex flex-col items-stretch gap-2 text-xs font-semibold";

type Status = "ready" | "copied" | "selected";

export function ContactForm({ defaultDestination }: { defaultDestination: DestinationId }) {
  const messageRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [status, setStatus] = useState<Status>("ready");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();

    if (!name || !email || !phone) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    setStatus("ready");
    setMessage(
      buildInquiryMessage({
        name,
        email,
        phone,
        destination: parseDestinationId(data.get("destination")),
      }),
    );
  }

  function handleInput() {
    setMessage(null);
    setInvalid(false);
    setStatus("ready");
  }

  async function handleCopy() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setStatus("copied");
    } catch {
      if (messageRef.current) window.getSelection()?.selectAllChildren(messageRef.current);
      setStatus("selected");
    }
  }

  const whatsappUrl = message ? buildWhatsAppUrl(WHATSAPP_NUMBER, message) : null;
  const channelStatus =
    status === "selected"
      ? "Seleccionamos tu consulta. Usa la opción Copiar de tu dispositivo."
      : whatsappUrl
        ? "WhatsApp abrirá tu consulta. Tú decides si enviarla."
        : "WhatsApp comercial pendiente de configurar. Copia el mensaje para compartirlo por tu canal habitual.";

  return (
    <form onSubmit={handleSubmit} onInput={handleInput} className="flex flex-col gap-5 text-primary">
      <Label className={FIELD_LABEL_CLASS}>
        Tu nombre
        <Input
          name="name"
          autoComplete="given-name"
          required
          maxLength={80}
          placeholder="¿Cómo te llamas?"
          className={FIELD_CLASS}
        />
      </Label>

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
        <Label className={FIELD_LABEL_CLASS}>
          Correo electrónico
          <Input
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={150}
            placeholder="tu@correo.com"
            className={FIELD_CLASS}
          />
        </Label>
        <Label className={FIELD_LABEL_CLASS}>
          WhatsApp con código de país
          <Input
            type="tel"
            name="phone"
            autoComplete="tel"
            required
            pattern="[+0-9 ()-]{8,24}"
            maxLength={24}
            placeholder="+51 999 999 999"
            className={FIELD_CLASS}
          />
        </Label>
      </div>

      <Label className={FIELD_LABEL_CLASS}>
        ¿Dónde quieres correr?
        <NativeSelect
          name="destination"
          defaultValue={defaultDestination}
          className="w-full [&_select]:h-12 [&_select]:rounded-sm [&_select]:border-primary/25 [&_select]:px-3 [&_select]:font-semibold"
        >
          <NativeSelectOption value="santiago-2027">
            Santiago 2027 · Maratón 42K · Desde US$1,499
          </NativeSelectOption>
          <NativeSelectOption value="rio">Río de Janeiro · Quiero novedades</NativeSelectOption>
          <NativeSelectOption value="roma">Roma · Quiero novedades</NativeSelectOption>
        </NativeSelect>
      </Label>

      <label className="flex items-start gap-3 text-xs">
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0 accent-primary" />
        <span>
          Entiendo que es una demostración y que mis datos se usarán únicamente para preparar mi
          consulta en esta pantalla.
        </span>
      </label>

      <Button
        type="submit"
        className="h-auto w-full justify-between rounded-sm px-6 py-4 text-sm font-bold shadow-[inset_0_-4px_0_var(--highlight)]"
      >
        Preparar mi consulta
        <ArrowUpRight aria-hidden />
      </Button>

      <p className="text-xs">La consulta no se envía desde esta demostración.</p>

      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          Revisa los datos del formulario.
        </p>
      )}

      <div role="status">
        {message && (
          <div className="flex flex-col items-start gap-3 border-t border-primary/25 pt-5">
            <strong className="text-sm">Tu consulta está preparada. Aún no se ha enviado.</strong>
            <div
              ref={messageRef}
              role="group"
              aria-label="Consulta preparada"
              className="w-full rounded-sm border border-primary/25 p-3 text-xs whitespace-pre-line"
            >
              {message}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={handleCopy} className="h-auto rounded-sm px-4 py-3 font-bold">
                {status === "copied" ? "Consulta copiada ✓" : "Copiar consulta"}
              </Button>
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants(), "h-auto rounded-sm px-4 py-3 font-bold")}
                >
                  Abrir WhatsApp
                  <ArrowUpRight aria-hidden />
                </a>
              )}
            </div>
            <p className="text-xs">{channelStatus}</p>
          </div>
        )}
      </div>
    </form>
  );
}
