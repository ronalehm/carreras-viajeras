import type { Metadata } from "next";
import { AccountSection, SiteFooter, SiteHeader } from "@/modules/landing";

export const metadata: Metadata = { title: "Ingresar o registrarse" };

export default function AccountPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <AccountSection />
      </main>
      <SiteFooter />
    </>
  );
}
