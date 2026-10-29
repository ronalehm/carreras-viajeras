"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Minimal local typing of the part of Cloudflare's `window.turnstile` API used here. */
type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: { sitekey: string; action: string; language: string; size: "flexible" },
  ) => string | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

function getTurnstile(): TurnstileApi | undefined {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

type TurnstileWidgetProps = {
  siteKey: string;
  action: "lead_submit";
  /** Tokens are single use: every change resets the widget for the next submission. */
  resetSignal: number;
};

/**
 * Cloudflare Turnstile rendered explicitly inside the parent `<form>`. The widget adds its own
 * hidden `cf-turnstile-response` field, so the token travels with the form's `FormData`.
 */
export function TurnstileWidget({ siteKey, action, resetSignal }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const lastResetSignalRef = useRef(resetSignal);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    const turnstile = scriptReady ? getTurnstile() : undefined;
    const container = containerRef.current;
    if (!turnstile || !container) return;

    const widgetId = turnstile.render(container, {
      sitekey: siteKey,
      action,
      language: "es",
      size: "flexible",
    });
    widgetIdRef.current = widgetId ?? null;

    return () => {
      if (widgetId) turnstile.remove(widgetId);
      widgetIdRef.current = null;
    };
  }, [scriptReady, siteKey, action]);

  useEffect(() => {
    if (resetSignal === lastResetSignalRef.current) return;
    lastResetSignalRef.current = resetSignal;
    const widgetId = widgetIdRef.current;
    if (widgetId) getTurnstile()?.reset(widgetId);
  }, [resetSignal]);

  return (
    <>
      {/* onReady runs after the first load and again on every remount (new form in stand mode). */}
      <Script src={TURNSTILE_SCRIPT_URL} onReady={() => setScriptReady(true)} />
      <div ref={containerRef} className="min-h-[65px] w-full" />
    </>
  );
}
