import { requireVerifiedEmail } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import { ensureReferralCode, getOwnReferrals, getOwnRewards } from "../services/rewards.service";
import type { OwnReferrals, OwnRewards } from "../types/rewards.types";
import { RunnerRewardsView } from "./RunnerRewardsView";

export async function RunnerRewards() {
  let data: { rewards: OwnRewards; referrals: OwnReferrals; referralUrl?: string };
  try {
    const actor = await requireVerifiedEmail();
    await ensureReferralCode(actor.id);
    const [rewards, referrals] = await Promise.all([getOwnRewards(actor.id), getOwnReferrals(actor.id)]);
    const referralUrl = referrals.code ? new URL(`/r/${encodeURIComponent(referrals.code)}`, getEnv().APP_ORIGIN).toString() : undefined;
    data = { rewards, referrals, referralUrl };
  } catch {
    return <><section id="beneficios" className="grid gap-3 rounded-2xl border p-5"><h2 className="text-xl font-semibold">Beneficios y recompensas</h2><p role="alert">No se pudieron cargar tus beneficios. Vuelve a intentarlo.</p></section><section id="referidos" className="grid gap-3 rounded-2xl border p-5"><h2 className="text-xl font-semibold">Referidos y estrellas</h2><p role="alert">No se pudieron cargar tus referidos y movimientos. Vuelve a intentarlo.</p></section></>;
  }
  return <RunnerRewardsView {...data} />;
}
