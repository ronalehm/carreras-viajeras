import { SignIn } from "@clerk/nextjs";
import type { AccessAudience, AuthDestination } from "../types/auth.types";

const AUDIENCE_CONFIG: Record<AccessAudience, { destination: AuthDestination; notice: string }> = {
  staff: {
    destination: "/crm",
    notice: "Solo para personas invitadas por un administrador.",
  },
  runner: {
    destination: "/cuenta",
    notice:
      "Este paso identifica tu acceso al sitio. Después podrás completar tu perfil; no te inscribe en un evento.",
  },
};

type AccessPanelProps = {
  audience?: AccessAudience;
};

/** Clerk sign-in/sign-up. The destination comes only from the audience, never from the URL. */
export function AccessPanel({ audience = "staff" }: AccessPanelProps) {
  const { destination, notice } = AUDIENCE_CONFIG[audience];

  return (
    <div className="flex flex-col items-center gap-4">
      <SignIn
        routing="hash"
        withSignUp
        forceRedirectUrl={destination}
        signUpForceRedirectUrl={destination}
      />
      <p className="text-sm text-muted-foreground">{notice}</p>
    </div>
  );
}
