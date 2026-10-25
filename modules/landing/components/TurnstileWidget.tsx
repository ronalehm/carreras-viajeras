"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// Minimal local typing of the explicit-render API (no @types package).
type TurnstileApi = {
  render(
    container: HTMLElement,
    options: { sitekey: string; action: string; language: string; theme: "light" },
  ): string | null | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

function getTurnstile(): TurnstileApi | undefined {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

type TurnstileWidgetProps = {
  siteKey: string;
  action: string;
  /** Change it after each server response: tokens are single-use, so the widget is reset. */
  resetSignal: number;
};

// Rendered inside the <form>: Turnstile injects the hidden `cf-turnstile-response` field.
// Expired tokens are refreshed by the widget itself (default `refresh-expired: "auto"`).
export function TurnstileWidget({ siteKey, action, resetSignal }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const turnstile = scriptReady ? getTurnstile() : undefined;
    if (!container || !turnstile) return;

    const widgetId = turnstile.render(container, {
      sitekey: siteKey,
      action,
      language: "es",
      theme: "light",
    });
    if (!widgetId) return;
    widgetIdRef.current = widgetId;

    return () => {
      widgetIdRef.current = null;
      turnstile.remove(widgetId);
    };
  }, [scriptReady, siteKey, action]);

  useEffect(() => {
    // On mount there is no widget yet, so only later changes of resetSignal reset it.
    const widgetId = widgetIdRef.current;
    if (widgetId) getTurnstile()?.reset(widgetId);
  }, [resetSignal]);

  return (
    <>
      <Script src={TURNSTILE_SCRIPT_URL} onReady={() => setScriptReady(true)} />
      <div ref={containerRef} className="min-h-[65px]" />
    </>
  );
}
