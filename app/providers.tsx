"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

// A single, stable QueryClient for the client tree; data stays in memory and is never persisted.
export function Providers({ children }: { children: ReactNode }) {
  // Las lecturas públicas bastan una vez por carga de página: sin recarga al volver el foco se evitan
  // peticiones extra al Worker y que una recarga fallida cambie el formulario de contacto.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
