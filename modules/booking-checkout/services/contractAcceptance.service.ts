import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookingContractAcceptances } from "@/lib/db-schema";
import { enabledCheckoutMode } from "./bookingCheckout.service";
import { getPreparedBookingCheckout } from "./prepare.service";
import { isSimulatedMode } from "../utils/simulatedCheckout";

export type ContractAcceptanceResult = "accepted" | "already_accepted" | "checkout_unavailable"
  | "reservation_unavailable" | "document_changed" | "acceptance_conflict";

export async function acceptBookingContract(
  bookingId: string,
  userId: string,
  documentHash: string,
): Promise<ContractAcceptanceResult> {
  const mode = enabledCheckoutMode();
  if (!mode) return "checkout_unavailable";
  const prepared = await getPreparedBookingCheckout(bookingId, userId, isSimulatedMode(mode));
  if (!prepared) return "reservation_unavailable";
  if (prepared.documentHash !== documentHash) return "document_changed";

  const inserted = await getDb().execute<{ booking_id: string; runner_user_id: string; document_hash: string }>(sql`
    INSERT INTO ${bookingContractAcceptances}
      (${sql.raw('"booking_id", "runner_user_id", "contract_version_key", "contract_document_hash", "document_snapshot", "document_hash"')})
    SELECT b.id, b.runner_user_id, ${prepared.contract.versionKey}, ${prepared.contract.documentHash},
      ${prepared.documentSnapshot}, ${prepared.documentHash}
    FROM bookings b
    WHERE b.id = ${bookingId}::uuid AND b.runner_user_id = ${userId}
      AND b.status = 'pending' AND b.reservation_expires_at > now()
    ON CONFLICT ("booking_id") DO NOTHING
    RETURNING booking_id, runner_user_id, document_hash
  `);
  if (inserted.rows[0]) return "accepted";

  const [existing] = await getDb().select({
    runnerUserId: bookingContractAcceptances.runnerUserId,
    documentHash: bookingContractAcceptances.documentHash,
  }).from(bookingContractAcceptances)
    .where(and(eq(bookingContractAcceptances.bookingId, bookingId), eq(bookingContractAcceptances.runnerUserId, userId)))
    .limit(1);
  if (existing) return existing.documentHash === documentHash ? "already_accepted" : "acceptance_conflict";
  return "reservation_unavailable";
}
