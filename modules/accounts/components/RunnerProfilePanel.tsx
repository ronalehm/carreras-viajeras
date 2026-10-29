import Link from "next/link";
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
};

/** /cuenta/perfil by state. Same width and tokens as AccountSection; the only h1 of the page. */
export function RunnerProfilePanel({ state }: RunnerProfilePanelProps) {
  return (
    <div className="mx-auto w-full max-w-170 px-[7%] pt-9 pb-14 text-primary md:px-0 md:py-14">
      <p className="mb-6 text-xs font-bold tracking-[0.2em]">MI CUENTA</p>
      <h1 className="mb-6 text-2xl font-semibold">Mi perfil</h1>

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

      {state.status === "ok" && <ProfileEditor {...state} />}
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
