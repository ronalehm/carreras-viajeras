import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessPanel, getCrmAccess } from "@/modules/accounts";

export const metadata: Metadata = {
  title: "Acceso al CRM",
  robots: { index: false },
};

export default async function CrmAccessPage() {
  const access = await getCrmAccess();
  if (access.status !== "unauthenticated") redirect("/crm");

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <AccessPanel />
    </main>
  );
}
