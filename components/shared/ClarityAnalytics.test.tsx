import { StrictMode, type ReactElement, type ReactNode } from "react";
import Link from "next/link";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_CONSENT_KEY,
  CLARITY_HOSTNAME,
  CLARITY_SCRIPT_ID,
  type ClarityCommand,
} from "@/lib/clarity";

const { nav, useUser, scriptProps } = vi.hoisted(() => ({
  nav: { pathname: "/" },
  useUser: vi.fn(),
  scriptProps: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

vi.mock("@clerk/nextjs", async () => {
  const { cloneElement } = await import("react");
  return {
    useUser,
    SignOutButton: ({ children }: { children: ReactElement }) => cloneElement(children),
  };
});

// Stand-in for next/script: records its props and, like it, inserts one element per id. It keeps
// the src in a data attribute and snapshots the queue at insertion time; nothing is ever fetched.
vi.mock("next/script", async () => {
  const { useEffect } = await import("react");
  function Script(props: { id: string; src: string; strategy: string }) {
    scriptProps(props);
    useEffect(() => {
      if (document.getElementById(props.id)) return;
      const element = document.createElement("script");
      element.id = props.id;
      element.type = "text/plain";
      element.dataset.src = props.src;
      element.dataset.queue = JSON.stringify(window.clarity?.q ?? null);
      document.body.appendChild(element);
    }, [props.id, props.src]);
    return null;
  }
  return { default: Script };
});

import { AccountMenu } from "@/modules/accounts/components/AccountMenu";
import { AnalyticsPreferencesButton } from "./AnalyticsPreferencesButton";
import { ClarityAnalytics } from "./ClarityAnalytics";

const PROJECT_ID = "z63dn24o7t";
const GRANTED: ClarityCommand = ["consentv2", { ad_Storage: "denied", analytics_Storage: "granted" }];
const DENIED: ClarityCommand = ["consentv2", { ad_Storage: "denied", analytics_Storage: "denied" }];
const BANNER_TEXT =
  "Usamos Microsoft Clarity para entender cómo se utiliza la web mediante clics y reproducciones de sesiones. Puedes aceptar o rechazar esta analítica opcional.";

const assign = vi.fn();
const reload = vi.fn();

function signedOut() {
  useUser.mockReturnValue({ isLoaded: true, isSignedIn: false, user: null });
}

function signedInAs(id: string) {
  useUser.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    user: {
      id,
      firstName: "Ana",
      fullName: "Ana Ríos",
      hasImage: false,
      imageUrl: "https://img.clerk.com/ana.png",
      primaryEmailAddress: { emailAddress: "ana@example.com" },
    },
  });
}

function storeConsent(analytics: "granted" | "denied", updatedAt = new Date().toISOString()) {
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({ version: 1, analytics, updatedAt }));
}

function renderAnalytics(extra: ReactNode = null) {
  const client = new QueryClient();
  const tree = () => (
    <QueryClientProvider client={client}>
      {extra}
      <AnalyticsPreferencesButton />
      <ClarityAnalytics />
    </QueryClientProvider>
  );
  const view = render(tree());
  return {
    ...view,
    rerender: () => view.rerender(tree()),
    navigate: (pathname: string) => {
      nav.pathname = pathname;
      view.rerender(tree());
    },
  };
}

const tags = () => document.querySelectorAll(`script#${CLARITY_SCRIPT_ID}`);
const queue = () => window.clarity?.q ?? [];
const identifies = () => queue().filter(([method]) => method === "identify");
const banner = () => screen.queryByRole("region", { name: "Preferencias de analítica" });
const cookieNames = () => document.cookie.split("; ").filter(Boolean).map((pair) => pair.split("=")[0]);

beforeEach(() => {
  vi.clearAllMocks();
  nav.pathname = "/";
  signedOut();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", PROJECT_ID);
  // jsdom cannot navigate: a stubbed location keeps the real origin and adds the production hostname.
  vi.stubGlobal("location", { ...window.location, hostname: CLARITY_HOSTNAME, assign, reload });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
});

afterEach(() => {
  cleanup();
  delete window.clarity;
  document.getElementById(CLARITY_SCRIPT_ID)?.remove();
  window.localStorage.clear();
  for (const name of cookieNames()) document.cookie = `${name}=; max-age=0; path=/`;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("activation", () => {
  it.each([
    ["without a project id", () => vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", undefined)],
    ["with an empty id", () => vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "")],
    ["with an invalid id", () => vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "z63dn24o7t/../x")],
    ["outside production", () => vi.stubEnv("NODE_ENV", "development")],
    ["on a lookalike hostname", () =>
      vi.stubGlobal("location", { ...window.location, hostname: `${CLARITY_HOSTNAME}.evil.com`, assign, reload })],
  ])("shows no banner, button or script %s", (_, configure) => {
    configure();
    storeConsent("granted");
    renderAnalytics();

    expect(banner()).toBeNull();
    expect(screen.queryByRole("button", { name: "Preferencias de analítica" })).toBeNull();
    expect(tags()).toHaveLength(0);
    expect(window.clarity).toBeUndefined();
  });
});

describe("consent", () => {
  it("asks first and inserts nothing before a decision", () => {
    renderAnalytics();

    expect(banner()?.textContent).toContain(BANNER_TEXT);
    expect(banner()?.getAttribute("aria-modal")).toBeNull();
    expect(screen.getByRole("button", { name: "Aceptar analítica" }).tagName).toBe("BUTTON");
    expect(screen.getByRole("button", { name: "Rechazar" }).tagName).toBe("BUTTON");
    expect(tags()).toHaveLength(0);
    expect(window.clarity).toBeUndefined();
  });

  it("sits above the fixed mobile CTA bar instead of covering it", () => {
    renderAnalytics();
    // MobileCta is h-[calc(3rem+env(safe-area-inset-bottom))] at bottom-0 below sm.
    expect(banner()?.className).toContain("bottom-[calc(3.75rem+env(safe-area-inset-bottom))]");
    expect(banner()?.className).toContain("sm:bottom-6");
  });

  it("does not show the banner on a denied page", () => {
    nav.pathname = "/cuenta";
    renderAnalytics();
    expect(banner()).toBeNull();
    expect(screen.queryByRole("button", { name: "Preferencias de analítica" })).toBeNull();
  });

  it("rejecting stores the decision and never loads the tag", () => {
    const { navigate } = renderAnalytics();
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));

    expect(banner()).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(ANALYTICS_CONSENT_KEY) ?? "").analytics).toBe("denied");
    navigate("/noticias");
    expect(tags()).toHaveLength(0);
    expect(window.clarity).toBeUndefined();
    expect(reload).not.toHaveBeenCalled();
  });

  it("accepting queues consentv2 (analytics granted, ads denied) before a single tag", () => {
    renderAnalytics();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar analítica" }));

    expect(tags()).toHaveLength(1);
    const [tag] = tags() as NodeListOf<HTMLScriptElement>;
    expect(tag.dataset.src).toBe(`https://www.clarity.ms/tag/${PROJECT_ID}`);
    expect(JSON.parse(tag.dataset.queue ?? "null")).toEqual([GRANTED]);
    expect(scriptProps).toHaveBeenCalledWith({
      id: CLARITY_SCRIPT_ID,
      strategy: "afterInteractive",
      src: `https://www.clarity.ms/tag/${PROJECT_ID}`,
    });
    expect(banner()).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(ANALYTICS_CONSENT_KEY) ?? "").analytics).toBe("granted");
  });

  it("loads for a returning visitor with consentv2 queued first", () => {
    storeConsent("granted");
    renderAnalytics();

    expect(banner()).toBeNull();
    expect(tags()).toHaveLength(1);
    expect(JSON.parse((tags()[0] as HTMLScriptElement).dataset.queue ?? "null")).toEqual([GRANTED]);
  });

  it("asks again when the decision expired after 180 days", () => {
    storeConsent("granted", new Date(Date.now() - 181 * 24 * 60 * 60 * 1000).toISOString());
    renderAnalytics();
    expect(banner()).not.toBeNull();
    expect(tags()).toHaveLength(0);
  });

  it("loads the tag once across navigation, remounts and Strict Mode", () => {
    storeConsent("granted");
    const first = renderAnalytics();
    first.navigate("/noticias");
    first.navigate("/viajes/maraton-santiago-2027");
    first.unmount();
    render(
      <StrictMode>
        <ClarityAnalytics />
      </StrictMode>,
    );

    expect(tags()).toHaveLength(1);
    expect(queue().filter(([method]) => method === "consentv2")).toEqual([GRANTED]);
  });

  it("keeps the page working and loads nothing when localStorage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    renderAnalytics(<p>Contenido</p>);

    expect(screen.getByText("Contenido")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar analítica" }));
    expect(banner()).toBeNull();
    expect(tags()).toHaveLength(0);
    expect(window.clarity).toBeUndefined();
  });

  it("reopens from the footer button with the keyboard and returns the focus", () => {
    storeConsent("denied");
    renderAnalytics();
    expect(banner()).toBeNull();

    const preferences = screen.getByRole("button", { name: "Preferencias de analítica" });
    expect(preferences.tagName).toBe("BUTTON");
    preferences.focus();
    // A native button turns Enter and Space into a click; jsdom does not, so the click stands in.
    fireEvent.click(preferences);

    expect(document.activeElement).toBe(banner());
    const accept = screen.getByRole("button", { name: "Aceptar analítica" });
    accept.focus();
    expect(document.activeElement).toBe(accept);
    fireEvent.click(accept);

    expect(banner()).toBeNull();
    expect(document.activeElement).toBe(preferences);
    expect(tags()).toHaveLength(1);
  });

  it("withdrawal sends consentv2 denied, clears only Clarity cookies, reloads and does not load again", () => {
    storeConsent("granted");
    document.cookie = "_clck=abc; path=/";
    document.cookie = "_clsk=def; path=/";
    document.cookie = "__session=clerk; path=/";
    let atReload: { commands: ClarityCommand[]; cookies: string[] } | null = null;
    reload.mockImplementation(() => {
      atReload = { commands: [...queue()], cookies: cookieNames() };
    });
    renderAnalytics();
    expect(tags()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Preferencias de analítica" }));
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(atReload).toEqual({ commands: [GRANTED, DENIED], cookies: ["__session"] });
    expect(JSON.parse(window.localStorage.getItem(ANALYTICS_CONSENT_KEY) ?? "").analytics).toBe("denied");

    // The next document starts unmarked and with the stored rejection: nothing loads.
    cleanup();
    delete window.clarity;
    document.getElementById(CLARITY_SCRIPT_ID)?.remove();
    renderAnalytics();
    expect(tags()).toHaveLength(0);
    expect(window.clarity).toBeUndefined();
  });
});

describe("public → private boundary", () => {
  it.each([
    "/crm",
    "/crm/acceso",
    "/cuenta",
    "/cuenta/perfil",
    "/mis-carreras",
    "/r/ABC123",
    "/viajes/maraton-santiago-2027/registro",
    "/viajes/maraton-santiago-2027/checkout",
  ])("a direct load of %s inserts nothing, even with consent", (pathname) => {
    storeConsent("granted");
    signedInAs("user_A");
    nav.pathname = pathname;
    renderAnalytics();

    expect(tags()).toHaveLength(0);
    expect(window.clarity).toBeUndefined();
    expect(banner()).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it("a Link from the landing to the CRM becomes a full navigation", () => {
    storeConsent("granted");
    renderAnalytics(
      <>
        <Link href="/crm">Ir a CRM</Link>
        <Link href="/noticias">Noticias</Link>
      </>,
    );
    let prevented: boolean | null = null;
    const observe = (event: Event) => {
      prevented = event.defaultPrevented;
      event.preventDefault(); // jsdom cannot follow the link
    };
    document.addEventListener("click", observe);

    fireEvent.click(screen.getByRole("link", { name: "Noticias" }));
    expect(assign).not.toHaveBeenCalled();
    expect(prevented).toBe(false);

    fireEvent.click(screen.getByRole("link", { name: "Ir a CRM" }));
    // next/link skips its client navigation when the click was already prevented.
    expect(prevented).toBe(true);
    expect(assign).toHaveBeenCalledExactlyOnceWith("http://localhost:3000/crm");
    document.removeEventListener("click", observe);
  });

  it("leaves new-tab, modified, download and external links alone", () => {
    storeConsent("granted");
    renderAnalytics(
      <>
        <a href="/crm" target="_blank">
          Nueva pestaña
        </a>
        <a href="/cuenta" download>
          Descarga
        </a>
        <a href="https://example.com/crm">Externo</a>
        <a href="/mis-carreras">Mis carreras</a>
      </>,
    );
    const stop = (event: Event) => event.preventDefault();
    document.addEventListener("click", stop);

    fireEvent.click(screen.getByText("Nueva pestaña"));
    fireEvent.click(screen.getByText("Descarga"));
    fireEvent.click(screen.getByText("Externo"));
    fireEvent.click(screen.getByText("Mis carreras"), { ctrlKey: true });
    fireEvent.click(screen.getByText("Mis carreras"), { button: 1 });
    expect(assign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Mis carreras"));
    expect(assign).toHaveBeenCalledExactlyOnceWith("http://localhost:3000/mis-carreras");
    document.removeEventListener("click", stop);
  });

  it("does not intercept links in a document without the tag", () => {
    renderAnalytics(<Link href="/crm">Ir a CRM</Link>);
    const stop = (event: Event) => event.preventDefault();
    document.addEventListener("click", stop);
    fireEvent.click(screen.getByRole("link", { name: "Ir a CRM" }));
    expect(assign).not.toHaveBeenCalled();
    document.removeEventListener("click", stop);
  });

  it("masks the account menu, in its portal too, and its private links open a new document", async () => {
    storeConsent("granted");
    signedInAs("user_A");
    renderAnalytics(<AccountMenu />);

    const trigger = screen.getByRole("button", { name: "Abrir menú de la cuenta" });
    expect(trigger.getAttribute("data-clarity-mask")).toBe("true");
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");
    const header = screen.getByText("Ana Ríos").closest("[data-clarity-mask]");
    expect(header?.getAttribute("data-clarity-mask")).toBe("true");
    expect(header?.textContent).toContain("ana@example.com");
    // Base UI renders the menu in a portal, outside the trigger's tree.
    expect(trigger.contains(menu)).toBe(false);

    fireEvent.click(screen.getByRole("menuitem", { name: "Mi perfil" }));
    expect(assign).toHaveBeenCalledExactlyOnceWith("http://localhost:3000/cuenta/perfil");
  });

  it("back/forward to a denied page in a marked document reloads and does nothing else", () => {
    storeConsent("granted");
    signedInAs("user_A");
    const { navigate } = renderAnalytics();
    const before = [...queue()];

    navigate("/crm");

    expect(reload).toHaveBeenCalledTimes(1);
    expect(queue()).toEqual(before);
    expect(assign).not.toHaveBeenCalled();
    expect(tags()).toHaveLength(1);
  });

  it.each(["loading", "loaded"] as const)("guards navigation while the tag is %s", (phase) => {
    storeConsent("granted");
    const sdk = vi.fn();
    const { navigate } = renderAnalytics(<Link href="/cuenta">Mi cuenta</Link>);
    // "loaded": the hosted tag replaced the queue with its own function.
    if (phase === "loaded") window.clarity = sdk;

    fireEvent.click(screen.getByRole("link", { name: "Mi cuenta" }));
    expect(assign).toHaveBeenCalledExactlyOnceWith("http://localhost:3000/cuenta");

    navigate("/viajes/maraton-santiago-2027/registro");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sdk).not.toHaveBeenCalled();
  });
});

describe("identity", () => {
  it("waits for Clerk to load, then sends only the user id", () => {
    storeConsent("granted");
    useUser.mockReturnValue({ isLoaded: false, isSignedIn: undefined, user: undefined });
    const { rerender } = renderAnalytics();
    expect(tags()).toHaveLength(1);
    expect(identifies()).toEqual([]);

    signedInAs("user_A");
    rerender();

    expect(identifies()).toEqual([["identify", "user_A"]]);
    const sent = JSON.stringify(queue());
    expect(sent).not.toContain("ana@example.com");
    expect(sent).not.toContain("Ana");
    expect(queue().every((command) => command.length === 2)).toBe(true);
  });

  it("leaves an anonymous visitor anonymous", () => {
    storeConsent("granted");
    renderAnalytics();
    expect(queue()).toEqual([GRANTED]);
  });

  it.each([
    ["pending", () => {}],
    ["denied", () => storeConsent("denied")],
  ])("does not identify a signed-in user without consent (%s)", (_, setConsent) => {
    setConsent();
    signedInAs("user_A");
    renderAnalytics();
    expect(window.clarity).toBeUndefined();
  });

  it("identifies after accepting and again on each public page", () => {
    signedInAs("user_A");
    const { navigate } = renderAnalytics();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar analítica" }));
    expect(queue()).toEqual([GRANTED, ["identify", "user_A"]]);

    navigate("/noticias");
    expect(identifies()).toEqual([
      ["identify", "user_A"],
      ["identify", "user_A"],
    ]);
  });

  it("calls the loaded tag directly with the id only", () => {
    storeConsent("granted");
    const { navigate } = renderAnalytics();
    const sdk = vi.fn();
    window.clarity = sdk;

    signedInAs("user_A");
    navigate("/contacto");

    expect(sdk).toHaveBeenCalledExactlyOnceWith("identify", "user_A");
  });

  it("sign-out (A → nobody) clears Clarity's cookies and reloads the marked document", () => {
    storeConsent("granted");
    signedInAs("user_A");
    document.cookie = "_clck=abc; path=/";
    document.cookie = "_clsk=def; path=/";
    document.cookie = "__session=clerk; path=/";
    const { rerender } = renderAnalytics();

    signedOut();
    rerender();

    expect(cookieNames()).toEqual(["__session"]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(identifies()).toEqual([["identify", "user_A"]]);
  });

  it("an account switch (A → B) reloads without identifying B in A's document", () => {
    storeConsent("granted");
    signedInAs("user_A");
    document.cookie = "_clsk=def; path=/";
    const { rerender } = renderAnalytics();

    signedInAs("user_B");
    rerender();

    expect(cookieNames()).toEqual([]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(identifies()).toEqual([["identify", "user_A"]]);
  });

  it("without the tag a sign-out only clears the cookies", () => {
    signedInAs("user_A");
    document.cookie = "_clck=abc; path=/";
    const { rerender } = renderAnalytics();

    signedOut();
    rerender();

    expect(cookieNames()).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });

  it("signing in (nobody → A) identifies without reloading", () => {
    storeConsent("granted");
    const { rerender } = renderAnalytics();

    signedInAs("user_A");
    rerender();

    expect(identifies()).toEqual([["identify", "user_A"]]);
    expect(reload).not.toHaveBeenCalled();
  });

  it("never identifies on a denied page", () => {
    storeConsent("granted");
    signedInAs("user_A");
    nav.pathname = "/mis-carreras";
    renderAnalytics();
    expect(window.clarity).toBeUndefined();
  });
});
