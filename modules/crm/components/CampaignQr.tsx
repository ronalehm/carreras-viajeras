"use client";

import { useRef } from "react";
import { Download } from "lucide-react";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";

type CampaignQrProps = {
  // Public registration link of the campaign (campaignLinks(...).registration).
  url: string;
  code: string;
};

// QR of the public link. The download serializes the rendered <svg> as is: no request, no canvas.
export function CampaignQr({ url, code }: CampaignQrProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  function download() {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `campana-${code}.svg`;
    link.click();
    // Deferred: some browsers start the download after click() returns.
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <div ref={containerRef} className="w-full max-w-64">
        <QRCode value={url} title={`QR de la campaña ${code}: ${url}`} level="M" role="img" className="h-auto w-full" />
      </div>
      <Button type="button" variant="outline" onClick={download}>
        <Download aria-hidden="true" />
        Descargar QR (SVG)
      </Button>
    </div>
  );
}
