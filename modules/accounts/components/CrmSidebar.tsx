"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import {
  CalendarCheck2,
  ChevronRight,
  ClipboardList,
  ContactRound,
  LayoutDashboard,
  Megaphone,
  Menu,
  Plane,
  Settings2,
  Tag,
  UsersRound,
  X,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SignOutButton } from "./SignOutButton";
import styles from "./CrmShell.module.css";

const ICONS = {
  dashboard: LayoutDashboard,
  leads: ContactRound,
  pending: ClipboardList,
  campaigns: Megaphone,
  trips: Plane,
  offers: Tag,
  bookings: CalendarCheck2,
  users: UsersRound,
  settings: Settings2,
};
const GROUPS = [
  { id: "overview", label: "Espacio de trabajo" },
  { id: "sales", label: "Gestión comercial" },
  { id: "admin", label: "Administración" },
] as const;

export type CrmNavItem = {
  label: string;
  href: string;
  icon: keyof typeof ICONS;
  group: (typeof GROUPS)[number]["id"];
};
type CrmSidebarProps = {
  email: string;
  roleLabels: string[];
  items: CrmNavItem[];
};

function Brand() {
  return (
    <Link
      href="/crm"
      aria-label="Carreras Viajeras, inicio del CRM"
      className="block w-40"
    >
      <Image
        src="/images/logo-cv.webp"
        alt="Carreras Viajeras"
        width={640}
        height={213}
        className="h-auto w-full"
      />
    </Link>
  );
}

export function CrmSidebar({ email, roleLabels, items }: CrmSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const pending =
    pathname === "/crm/leads" &&
    searchParams.get("responsable") === "mios" &&
    searchParams.get("seguimiento") === "pendientes";

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    function closeOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false);
    }
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  function active(item: CrmNavItem) {
    if (item.icon === "pending") return pending;
    if (item.href === "/crm") return pathname === "/crm";
    if (item.href === "/crm/leads" && pending) return false;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  function navigationItem(item: CrmNavItem) {
    const selected = active(item);
    const Icon = ICONS[item.icon];
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={selected ? "page" : undefined}
          onNavigate={() => setOpen(false)}
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
            selected
              ? "bg-primary/8 text-primary"
              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          )}
        >
          <Icon
            aria-hidden="true"
            strokeWidth={1.75}
            className="size-4.5 shrink-0"
          />
          <span>{item.label}</span>
          {selected && (
            <ChevronRight
              aria-hidden="true"
              strokeWidth={1.75}
              className="ml-auto size-3.5"
            />
          )}
        </Link>
      </li>
    );
  }

  function navigation() {
    const settings = items.find((item) => item.icon === "settings");
    return (
      <nav aria-label="CRM" className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto overscroll-contain px-3 py-6">
          {GROUPS.map((group) => {
            const links = items.filter(
              (item) => item.group === group.id && item.icon !== "settings",
            );
            if (!links.length) return null;
            return (
              <div key={group.id} className="space-y-3">
                <p className="px-3 text-[0.6875rem] font-medium tracking-widest text-muted-foreground uppercase">
                  {group.label}
                </p>
                <ul className="space-y-1">{links.map(navigationItem)}</ul>
              </div>
            );
          })}
        </div>
        {settings && (
          <div className="shrink-0 border-t border-border/60 px-3 py-3">
            <ul>{navigationItem(settings)}</ul>
          </div>
        )}
      </nav>
    );
  }

  function account() {
    return (
      <div className="shrink-0 space-y-4 border-t border-border/60 p-5 [&_button]:w-full">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/8 text-sm font-semibold text-primary"
          >
            {email.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p title={email} className="truncate text-xs font-medium">
              {email}
            </p>
            <p className="mt-1.5 inline-flex rounded-full bg-muted/80 px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground">
              {roleLabels.join(", ")}
            </p>
          </div>
        </div>
        <SignOutButton />
      </div>
    );
  }

  return (
    <>
      <aside
        aria-label="Panel del CRM"
        className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border/60 bg-card lg:flex"
      >
        <div className="border-b border-border/60 px-6 py-6">
          <Brand />
        </div>
        {navigation()}
        {account()}
      </aside>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <header
          className={cn(
            styles.chrome,
            "flex h-20 items-center justify-between px-4 lg:hidden",
          )}
        >
          <Brand />
          <Dialog.Trigger
            aria-label="Abrir menú del CRM"
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              styles.iconControl,
              "rounded-xl",
            )}
          >
            <Menu aria-hidden="true" />
          </Dialog.Trigger>
        </header>
        <Dialog.Portal>
          <Dialog.Backdrop className={cn(styles.scrim, "fixed inset-0 z-40")} />
          <Dialog.Popup
            className={cn(
              styles.drawer,
              "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col",
            )}
          >
            <div className="flex items-center justify-between border-b p-4">
              <Dialog.Title className="text-sm font-semibold">
                Carreras Viajeras · CRM
              </Dialog.Title>
              <Dialog.Close
                aria-label="Cerrar menú"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  styles.iconControl,
                  "rounded-xl",
                )}
              >
                <X aria-hidden="true" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Navegación y cuenta del equipo de Carreras Viajeras.
            </Dialog.Description>
            {navigation()}
            {account()}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
