import { getCurrentUser } from "@/lib/auth/guards";
import { checkoutAccessFor, checkoutJson, checkoutRequiresDemoParticipant } from "@/modules/booking-checkout";

// Decides per request whether the static trip page shows "Continuar al checkout". The answer is
// only `{ available }` (never the mode or the reason) and is never cached. Test and live read no
// session; demo needs a signed-in, unblocked, active demo participant. Any failure answers false.
export async function GET() {
  try {
    let userId: string | null = null;
    if (checkoutRequiresDemoParticipant()) {
      const user = await getCurrentUser().catch(() => null);
      userId = user && !user.blocked ? user.id : null;
    }
    return checkoutJson({ available: await checkoutAccessFor(userId) });
  } catch {
    // Fixed text only: the original error may carry SQL, secrets or personal data.
    console.error("booking checkout: access check failed");
    return checkoutJson({ available: false });
  }
}
