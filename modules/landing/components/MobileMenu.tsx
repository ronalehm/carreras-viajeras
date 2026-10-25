"use client";

import Link from "next/link";
import { EllipsisVertical } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string };

/** Below `md`: kebab button that opens the header navigation. */
export function MobileMenu({ links }: { links: NavLink[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Abrir menú"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "size-11 rounded-full text-primary hover:bg-primary/10 hover:text-primary md:hidden",
        )}
      >
        <EllipsisVertical aria-hidden className="size-6" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-xl p-2">
        {links.map(({ href, label }) => (
          <DropdownMenuItem
            key={href}
            render={<Link href={href} />}
            className="min-h-11 rounded-lg px-3 text-base font-medium text-primary no-underline"
          >
            {label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<Link href="/contacto" />}
          className="min-h-11 rounded-full bg-highlight px-4 text-base font-semibold text-night no-underline focus:bg-highlight/85 focus:text-night"
        >
          Quiero correr
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
