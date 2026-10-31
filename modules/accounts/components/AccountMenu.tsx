"use client";

import { SignOutButton as ClerkSignOutButton, useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SignOutDestination } from "../types/auth.types";

const SIGN_OUT_DESTINATION: SignOutDestination = "/cuenta";
const ITEM_CLASS = "min-h-11 rounded-lg px-3 text-base font-medium text-primary no-underline";

// Presentation only: a 200 shows the link, anything else (401, 403, network) hides it.
// The /crm layout stays the guard.
async function fetchCanAccessCrm() {
  const response = await fetch("/api/crm/me", { cache: "no-store" });
  return response.status === 200;
}

type AccountMenuProps = {
  /** Shown without a session and while Clerk loads, so the header keeps its space. */
  fallback?: ReactNode;
};

/**
 * Avatar menu of the public headers. The session is read on the client, so the headers that
 * render it stay static. It protects nothing: every destination checks its own access.
 */
export function AccountMenu({ fallback = <span aria-hidden className="size-10" /> }: AccountMenuProps) {
  const { isLoaded, isSignedIn, user } = useUser();
  const userId = isSignedIn ? user.id : null;
  // Asked once per account and page load; another account gets its own key.
  const { data: canAccessCrm } = useQuery({
    queryKey: ["accounts", "crm-access", userId],
    queryFn: fetchCanAccessCrm,
    enabled: userId !== null,
    retry: false,
    staleTime: Infinity,
  });

  if (!isLoaded || !isSignedIn) return fallback;

  const email = user.primaryEmailAddress?.emailAddress;
  const name = user.fullName ?? user.firstName ?? email ?? "";
  const initial = (user.firstName ?? name).trim().charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Abrir menú de la cuenta"
        data-clarity-mask="true"
        className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {user.hasImage ? (
          <Image
            src={user.imageUrl}
            alt=""
            width={40}
            height={40}
            unoptimized
            className="size-full object-cover"
          />
        ) : (
          <span aria-hidden>{initial}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-xl p-2">
        {/* Rendered in Base UI's portal: the mask travels with the personal content. */}
        <div data-clarity-mask="true" className="px-3 py-2 text-primary">
          {name && <p className="truncate text-sm font-semibold">{name}</p>}
          {email && email !== name && (
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/cuenta/perfil" />} className={ITEM_CLASS}>
          Mi perfil
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/mis-carreras" />} className={ITEM_CLASS}>
          Mis carreras
        </DropdownMenuItem>
        {canAccessCrm === true && (
          <DropdownMenuItem render={<Link href="/crm" />} className={ITEM_CLASS}>
            Ir a CRM
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <ClerkSignOutButton redirectUrl={SIGN_OUT_DESTINATION}>
          <DropdownMenuItem className={ITEM_CLASS}>Cerrar sesión</DropdownMenuItem>
        </ClerkSignOutButton>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
