import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Card, CardContent } from "@/components/ui/card";
import { getCrmAccess, SignInForm } from "@/modules/accounts";

export const metadata: Metadata = {
  title: "Acceso al CRM",
  robots: { index: false },
};

export default async function CrmAccessPage() {
  // Per request: at build the guard fails closed before reading cookies(), which would prerender this.
  await connection();
  const access = await getCrmAccess();
  if (access.status !== "unauthenticated") redirect("/crm");

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent>
          <SignInForm />
        </CardContent>
      </Card>
    </main>
  );
}
