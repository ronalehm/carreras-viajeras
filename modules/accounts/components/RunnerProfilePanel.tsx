import Link from "next/link";
import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, MailWarning } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import type { RunnerProfilePageState } from "../utils/runnerProfilePage";
import { getMissingProfileSections, PROFILE_SECTION_LABELS } from "../utils/runnerProfileDisplay";
import { RunnerProfileForm } from "./RunnerProfileForm";
import { SignOutButton } from "./SignOutButton";

type RunnerProfilePanelProps = {
  // The page redirects the unauthenticated state before rendering the panel.
  state: Exclude<RunnerProfilePageState, { status: "unauthenticated" }>;
  careers?: ReactNode;
  children?: ReactNode;
};

/** /cuenta/perfil by state. Same width and tokens as AccountSection; the only h1 of the page. */
export function RunnerProfilePanel({ state, careers, children }: RunnerProfilePanelProps) {
  return (
    <div className="mx-auto w-full max-w-5xl px-[6%] pt-9 pb-14 text-primary md:py-14">
      <p className="mb-6 text-xs font-bold tracking-[0.2em]">MI CUENTA</p>
      <h1 className="mb-6 text-3xl font-semibold">Mi cuenta</h1>

      {state.status === "unverified" && (
        <div className="flex flex-col items-start gap-4">
          <Alert>
            <MailWarning aria-hidden />
            <AlertTitle>Verifica tu correo para completar tu perfil.</AlertTitle>
            <AlertDescription>Cierra sesión y vuelve a ingresar: te enviaremos un código.</AlertDescription>
          </Alert>
          <SignOutButton redirectTo="/cuenta" />
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-col items-start gap-4">
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertTitle>No pudimos cargar tu perfil. Inténtalo de nuevo en unos minutos.</AlertTitle>
          </Alert>
          <Link href="/cuenta/perfil" className={buttonVariants({ variant: "outline" })}>
            Reintentar
          </Link>
        </div>
      )}

      {state.status === "ok" && (
        <>
          <nav aria-label="Mi cuenta" className="mb-8 border-b border-border pb-4">
            <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold">
              {careers && <li><a href="#mis-carreras" className="underline underline-offset-4">Mis carreras</a></li>}
              {children && (
                <>
                  <li><a href="#beneficios" className="underline underline-offset-4">Beneficios</a></li>
                  <li><a href="#referidos" className="underline underline-offset-4">Referidos</a></li>
                </>
              )}
              <li><a href="#mi-perfil" className="underline underline-offset-4">Mi perfil</a></li>
            </ul>
          </nav>
          <div className="space-y-12">
            {careers}
            {children}
            <section id="mi-perfil" aria-labelledby="my-profile-title" className="scroll-mt-6 space-y-5 border-t border-border pt-8">
              <h2 id="my-profile-title" className="text-2xl font-semibold">Mi perfil</h2>
              <ProfileEditor {...state} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function ProfileEditor({ email, today, profile }: Extract<RunnerProfilePageState, { status: "ok" }>) {
  const missing = getMissingProfileSections(profile, today);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground">Correo de tu cuenta: {email}</p>
      {/* role="status": after a save the revalidated page announces the new completeness. */}
      <Alert role="status">
        {missing.length === 0 ? <CircleCheck aria-hidden /> : <Info aria-hidden />}
        <AlertTitle>
          {missing.length === 0
            ? "Tu perfil está completo."
            : `Te falta completar: ${missing.map((section) => PROFILE_SECTION_LABELS[section]).join(", ")}.`}
        </AlertTitle>
      </Alert>
      <RunnerProfileForm profile={profile} today={today} />
    </div>
  );
}
