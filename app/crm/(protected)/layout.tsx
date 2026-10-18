import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CrmShell, getCrmAccess, NoCrmAccess } from "@/modules/accounts";

export const metadata: Metadata = {
  robots: { index: false },
};

export default async function CrmProtectedLayout({ children }: LayoutProps<"/crm">) {
  const access = await getCrmAccess();
  if (access.status === "unauthenticated") redirect("/crm/acceso");
  if (access.status === "forbidden") return <NoCrmAccess />;

  return (
    <CrmShell email={access.user.email} roles={access.user.staffRoles}>
      {children}
    </CrmShell>
  );
}
