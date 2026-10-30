"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { fetchCheckoutAvailable } from "../services/checkoutAccess.api";
import { landingQueryKeys } from "./landingQueryKeys";

// Asked once Clerk has loaded (so the request carries a refreshed session) and again when the
// signed-in account changes; the server reads the session itself, the key only follows it. No
// retry: while it loads or after a failure the checkout link stays hidden.
export function useCheckoutAccess() {
  const { isLoaded, userId } = useAuth();
  return useQuery({
    queryKey: landingQueryKeys.checkoutAccess(userId ?? null),
    queryFn: fetchCheckoutAvailable,
    enabled: isLoaded,
    retry: false,
  });
}
