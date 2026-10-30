"use client";

import Link from "next/link";
import { SignOutButton as ClerkSignOutButton } from "@clerk/nextjs";
import { ChevronsUpDown, LogOut, Settings2, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { SignOutDestination } from "../types/auth.types";

const SIGN_OUT_DESTINATION: SignOutDestination = "/crm/acceso";
const ICON_PROPS = { "aria-hidden": true, strokeWidth: 1.5 } as const;

type CrmAccountMenuProps = {
  email: string;
  roleLabels: string[];
  canOpenSettings: boolean;
  /** Mobile drawer: 44 px touch targets. */
  mobile?: boolean;
  onNavigate?: () => void;
};

export function CrmAccountMenu({
  email,
  roleLabels,
  canOpenSettings,
  mobile = false,
  onNavigate,
}: CrmAccountMenuProps) {
  const roles = roleLabels.join(", ");
  // macOS context menu: accent-filled highlight with white text and icons.
  const itemClassName = cn(
    "gap-2.5 rounded-md px-2 text-[0.8125rem] transition-colors duration-150 motion-reduce:transition-none",
    "focus:bg-primary focus:text-primary-foreground not-data-[variant=destructive]:focus:**:text-primary-foreground",
    mobile ? "min-h-11 text-sm" : "min-h-8",
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-foreground/5 data-popup-open:bg-foreground/5",
          mobile && "min-h-11",
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.8125rem] font-semibold text-primary"
        >
          {email.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="sr-only">Menú de cuenta: </span>
          <span title={email} className="block truncate text-[0.8125rem] font-medium">
            {email}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{roles}</span>
        </span>
        <ChevronsUpDown {...ICON_PROPS} className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        sideOffset={6}
        className="min-w-56 rounded-xl p-1.5 shadow-lg motion-reduce:animate-none"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5">
            <span className="block truncate text-[0.8125rem] font-medium text-foreground">{email}</span>
            <span className="block text-xs font-normal text-muted-foreground">{roles}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="mx-0 bg-border/70" />
          <DropdownMenuItem
            render={<Link href="/cuenta/perfil" onNavigate={onNavigate} />}
            className={itemClassName}
          >
            <UserRound {...ICON_PROPS} />
            Ver perfil
          </DropdownMenuItem>
          {canOpenSettings && (
            <DropdownMenuItem
              render={<Link href="/crm/configuraciones" onNavigate={onNavigate} />}
              className={itemClassName}
            >
              <Settings2 {...ICON_PROPS} />
              Configuraciones
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="mx-0 bg-border/70" />
        <ClerkSignOutButton redirectUrl={SIGN_OUT_DESTINATION}>
          <DropdownMenuItem className={itemClassName}>
            <LogOut {...ICON_PROPS} />
            Cerrar sesión
          </DropdownMenuItem>
        </ClerkSignOutButton>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
