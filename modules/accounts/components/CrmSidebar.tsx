"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import {
  CalendarCheck2,
  ContactRound,
  FileText,
  LayoutDashboard,
  Megaphone,
  Menu,
  Newspaper,
  Plane,
  Store,
  Star,
  Tag,
  UsersRound,
  X,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CrmAccountMenu } from "./CrmAccountMenu";
import styles from "./CrmShell.module.css";

const ICONS = {
  dashboard: LayoutDashboard,
  leads: ContactRound,
  campaigns: Megaphone,
  trips: Plane,
  offers: Tag,
  contracts: FileText,
  bookings: CalendarCheck2,
  users: UsersRound,
  sponsors: Store,
  content: Newspaper,
  rewards: Star,
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
  canOpenSettings: boolean;
};

function Brand() {
  return (
    <Link
      href="/crm"
      aria-label="Carreras Viajeras, inicio del CRM"
      className="block w-32 rounded-md"
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

export function CrmSidebar({
  email,
  roleLabels,
  items,
  canOpenSettings,
}: CrmSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    function closeOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false);
    }
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  function active(item: CrmNavItem) {
    if (item.href === "/crm") return pathname === "/crm";
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  // The desktop rows follow macOS (32 px, 13 px); the mobile drawer keeps 44 px touch targets.
  function navigationItem(item: CrmNavItem, mobile: boolean) {
    const selected = active(item);
    const Icon = ICONS[item.icon];
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={selected ? "page" : undefined}
          onNavigate={() => setOpen(false)}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 font-medium",
            mobile ? "min-h-11 text-sm" : "h-8 text-[0.8125rem]",
            selected
              ? "bg-primary/10 text-foreground"
              : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground",
          )}
        >
          <Icon
            aria-hidden="true"
            strokeWidth={1.5}
            className={cn(
              "size-4 shrink-0",
              selected ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span className="truncate">{item.label}</span>
        </Link>
      </li>
    );
  }

  function navigation(mobile: boolean) {
    return (
      <nav aria-label="CRM" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <div className="space-y-5">
          {GROUPS.map((group) => {
            const links = items.filter((item) => item.group === group.id);
            if (!links.length) return null;
            return (
              <div key={group.id} className="space-y-1">
                <p className="px-2.5 text-[0.6875rem] font-semibold text-muted-foreground">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {links.map((item) => navigationItem(item, mobile))}
                </ul>
              </div>
            );
          })}
        </div>
      </nav>
    );
  }

  function account(mobile: boolean) {
    return (
      <div className="shrink-0 border-t border-border/60 p-3">
        <CrmAccountMenu
          email={email}
          roleLabels={roleLabels}
          canOpenSettings={canOpenSettings}
          mobile={mobile}
          onNavigate={() => setOpen(false)}
        />
      </div>
    );
  }

  return (
    <>
      <aside
        aria-label="Panel del CRM"
        className={cn(
          styles.material,
          "fixed inset-y-0 left-0 z-30 hidden w-64 flex-col lg:flex",
        )}
      >
        <div className="px-5 pt-5 pb-3">
          <Brand />
        </div>
        {navigation(false)}
        {account(false)}
      </aside>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <header
          className={cn(
            styles.chrome,
            "flex h-16 items-center justify-between px-4 lg:hidden",
          )}
        >
          <Brand />
          <Dialog.Trigger
            aria-label="Abrir menú del CRM"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              styles.iconControl,
              "rounded-lg",
            )}
          >
            <Menu aria-hidden="true" strokeWidth={1.5} />
          </Dialog.Trigger>
        </header>
        <Dialog.Portal>
          <Dialog.Backdrop className={cn(styles.scrim, "fixed inset-0 z-40")} />
          <Dialog.Popup
            className={cn(
              styles.material,
              styles.drawer,
              "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col",
            )}
          >
            <div className="flex items-center justify-between border-b border-border/60 py-2 pr-2 pl-5">
              <Dialog.Title className="text-sm font-semibold">
                Carreras Viajeras · CRM
              </Dialog.Title>
              <Dialog.Close
                aria-label="Cerrar menú"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  styles.iconControl,
                  "rounded-lg",
                )}
              >
                <X aria-hidden="true" strokeWidth={1.5} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Navegación y cuenta del equipo de Carreras Viajeras.
            </Dialog.Description>
            {navigation(true)}
            {account(true)}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
