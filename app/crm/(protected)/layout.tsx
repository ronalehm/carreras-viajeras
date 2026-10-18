import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { CrmShell, getCrmAccess, NoCrmAccess } from "@/modules/accounts";

export const metadata: Metadata = {
  robots: { index: false },
};

export default async function CrmProtectedLayout({ children }: LayoutProps<"/crm">) {
  // Per request: at build the guard fails closed before reading cookies(), which would prerender this.
  await connection();
  const access = await getCrmAccess();
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") return <NoCrmAccess />;

  return (
    <CrmShell email={access.user.email} roles={access.user.staffRoles}>
      {children}
    </CrmShell>
  );
}
