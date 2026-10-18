import "server-only";
import { connection } from "next/server";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { requirePermission, type CurrentUser } from "@/lib/auth/guards";
import type { Permission } from "@/lib/auth/permissions";

export type CrmAccess =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "ok"; user: CurrentUser };

export async function getCrmAccess(permission: Permission = "crm.access"): Promise<CrmAccess> {
  // Per request: at build the guard fails closed before reading cookies(), which would prerender callers.
  await connection();
  try {
    const user = await requirePermission(permission);
    return { status: "ok", user };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { status: "unauthenticated" };
    if (error instanceof ForbiddenError) return { status: "forbidden" };
    throw error;
  }
}
