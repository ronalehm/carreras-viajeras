"use client";

import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type JSX } from "react";
import { Button } from "@/components/ui/button";
import {
  ANALYTICS_PREFERENCES_EVENT,
  CLARITY_CONSENT_DENIED,
  CLARITY_CONSENT_GRANTED,
  CLARITY_SCRIPT_ID,
  clarityTagSrc,
  clearClarityCookies,
  ensureClarityQueue,
  getClarityProjectId,
  getStoredAnalyticsConsent,
  isClarityEnvironment,
  isClarityPathAllowed,
  writeAnalyticsConsent,
  type AnalyticsConsent,
  type ClarityCommand,
} from "@/lib/clarity";

const BANNER_TEXT =
  "Usamos Microsoft Clarity para entender cómo se utiliza la web mediante clics y reproducciones de sesiones. Puedes aceptar o rechazar esta analítica opcional.";

const subscribeNever = () => () => {};

function readActiveProjectId(): string | null {
  const projectId = getClarityProjectId(process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID);
  return projectId && isClarityEnvironment(process.env.NODE_ENV, window.location.hostname) ? projectId : null;
}

/** The Clarity project id when the integration is active in this browser; null on the server and elsewhere. */
export function useClarityProjectId(): string | null {
  return useSyncExternalStore(subscribeNever, readActiveProjectId, () => null);
}

// The stored decision, re-read whenever this tab writes a new one.
const consentListeners = new Set<() => void>();
function subscribeConsent(listener: () => void) {
  consentListeners.add(listener);
  return () => void consentListeners.delete(listener);
}
const readConsent = () => getStoredAnalyticsConsent(Date.now());

// A document is "marked" once the Clarity queue exists in it: the tag was inserted (or is being).
// It stays marked until the next full document load.
const tagListeners = new Set<() => void>();
function subscribeTag(listener: () => void) {
  tagListeners.add(listener);
  return () => void tagListeners.delete(listener);
}
const isTagInserted = () => typeof window.clarity === "function";

/** Analytics never breaks the page: a failing Clarity call is ignored. */
function sendToClarity(...command: ClarityCommand) {
  try {
    window.clarity?.(...command);
  } catch {
    // Ignored on purpose: the page keeps working without analytics.
  }
}

/** consentv2 goes into the queue first; only then the <Script> renders and inserts the tag. */
function insertTag() {
  ensureClarityQueue();
  sendToClarity("consentv2", CLARITY_CONSENT_GRANTED);
  tagListeners.forEach((listener) => listener());
}

/** Full reload, at most once per document: the only proven way to unload code that already ran. */
function reloadOnce(reloading: { current: boolean }) {
  if (reloading.current) return;
  reloading.current = true;
  window.location.reload();
}

/**
 * Same-origin links to a denied path leave a marked document with a full navigation, so the
 * next document starts without the tag. Covers <Link>, portals (account menu) and Clerk links.
 */
function leaveMarkedDocument(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return;
  if (anchor.target && anchor.target !== "_self") return;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin || isClarityPathAllowed(url.pathname)) return;
  event.preventDefault();
  window.location.assign(url.href);
}

/**
 * Microsoft Clarity with prior consent (analytics-clarity spec): consent banner, a single tag per
 * public document, full document boundaries towards private pages and the Clerk id only.
 */
export function ClarityAnalytics(): JSX.Element | null {
  const projectId = useClarityProjectId();
  const pathname = usePathname();
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => null);
  const tagInserted = useSyncExternalStore(subscribeTag, isTagInserted, () => false);
  const { isLoaded, user } = useUser();
  // undefined while Clerk loads; null for a visitor without a session.
  const userId = isLoaded ? (user?.id ?? null) : undefined;
  const pathAllowed = isClarityPathAllowed(pathname);

  const [reopened, setReopened] = useState(false);
  const [decidedHere, setDecidedHere] = useState(false);
  const bannerRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const reloading = useRef(false);
  const previousUserId = useRef<string | null | undefined>(undefined);

  // Safety net: a marked document never shows a denied page (back/forward, Clerk redirects).
  useLayoutEffect(() => {
    if (tagInserted && !pathAllowed) reloadOnce(reloading);
  }, [tagInserted, pathAllowed]);

  // Sign-out or account switch in this document: the next clicks must not inherit the old id.
  useLayoutEffect(() => {
    if (userId === undefined) return;
    const previous = previousUserId.current;
    previousUserId.current = userId;
    if (!previous || previous === userId) return;
    clearClarityCookies(window.location.hostname);
    if (isTagInserted()) reloadOnce(reloading);
  }, [userId]);

  // Live check, not the snapshot: Strict Mode re-runs this effect before the re-render.
  useEffect(() => {
    if (projectId && consent === "granted" && pathAllowed && !isTagInserted() && !reloading.current) insertTag();
  }, [projectId, consent, pathAllowed]);

  useEffect(() => {
    if (!tagInserted) return;
    document.addEventListener("click", leaveMarkedDocument, true);
    return () => document.removeEventListener("click", leaveMarkedDocument, true);
  }, [tagInserted]);

  useEffect(() => {
    if (tagInserted && consent === "granted" && pathAllowed && userId && !reloading.current) {
      sendToClarity("identify", userId);
    }
  }, [tagInserted, consent, pathAllowed, userId, pathname]);

  useEffect(() => {
    function open() {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setReopened(true);
    }
    window.addEventListener(ANALYTICS_PREFERENCES_EVENT, open);
    return () => window.removeEventListener(ANALYTICS_PREFERENCES_EVENT, open);
  }, []);

  useEffect(() => {
    if (reopened) bannerRef.current?.focus();
  }, [reopened]);

  function choose(analytics: AnalyticsConsent) {
    const saved = writeAnalyticsConsent(analytics, Date.now());
    setReopened(false);
    setDecidedHere(true);
    if (returnFocus.current?.isConnected) returnFocus.current.focus();
    returnFocus.current = null;
    if (analytics === "denied") {
      // Withdrawal: tell Clarity, drop its cookies and unload the JavaScript that already ran.
      const wasInserted = isTagInserted();
      if (wasInserted) sendToClarity("consentv2", CLARITY_CONSENT_DENIED);
      clearClarityCookies(window.location.hostname);
      if (wasInserted) reloadOnce(reloading);
    }
    if (saved) consentListeners.forEach((listener) => listener());
  }

  const showBanner = projectId !== null && pathAllowed && (reopened || (consent === null && !decidedHere));
  if (!showBanner && !(tagInserted && projectId)) return null;

  return (
    <>
      {tagInserted && projectId && (
        <Script id={CLARITY_SCRIPT_ID} strategy="afterInteractive" src={clarityTagSrc(projectId)} />
      )}
      {showBanner && (
        <section
          ref={bannerRef}
          tabIndex={-1}
          aria-label="Preferencias de analítica"
          // Above the fixed mobile CTA bar (3rem + safe area), never over it; not modal.
          className="fixed inset-x-3 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border border-primary/15 bg-background p-4 text-sm text-night shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:right-auto sm:bottom-6 sm:left-6"
        >
          <p className="leading-relaxed">{BANNER_TEXT}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="h-10 rounded-full px-5" onClick={() => choose("granted")}>
              Aceptar analítica
            </Button>
            <Button type="button" variant="outline" className="h-10 rounded-full px-5" onClick={() => choose("denied")}>
              Rechazar
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
