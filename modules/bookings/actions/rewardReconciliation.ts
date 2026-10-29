import "server-only";
import { reconcileBookingRewards } from "@/modules/rewards";

// Financial mutations have already committed. A transient loyalty failure must not
// turn an accepted receipt into a retry that appears to need another payment.
// Wallet/claim reads also reconcile the same facts idempotently before spending.
export async function reconcileBookingAfterCommit(bookingId: string): Promise<void> {
  try {
    await reconcileBookingRewards(bookingId);
  } catch {
    console.error("rewards: reconciliation pending");
  }
}
