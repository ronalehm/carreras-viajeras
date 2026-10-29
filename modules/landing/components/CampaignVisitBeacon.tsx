"use client";

import { useEffect, useRef } from "react";

type CampaignVisitBeaconProps = {
  slug: string;
  code: string;
};

/**
 * Counts one campaign visit per mount (Strict Mode's double effect included). Sent from the
 * browser so link previews, bots and prefetches don't count; failures are ignored silently.
 */
export function CampaignVisitBeacon({ slug, code }: CampaignVisitBeaconProps) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    fetch("/api/campaign-visits", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, c: code }),
    }).catch(() => {});
  }, [slug, code]);

  return null;
}
