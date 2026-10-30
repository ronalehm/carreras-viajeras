// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/db",()=>({getDb:vi.fn()}));
import { getDb } from "@/lib/db";
import { persistCheckoutReservation, type CheckoutReservationSnapshot } from "./bookingCheckout.service";

const snapshot:CheckoutReservationSnapshot={
 requestId:"11111111-1111-4111-8111-111111111111",inputHash:"a".repeat(64),userId:"runner-1",email:"runner@example.invalid",leadId:"22222222-2222-4222-8222-222222222222",tripId:"33333333-3333-4333-8333-333333333333",
 participantName:"Runner Test",packageLabel:"Oferta de prueba",distance:null,totalUsd:1000,initialPaymentUsd:250,balanceDueOn:"2027-01-01",
 offerVersionId:"44444444-4444-4444-8444-444444444444",offerVersion:1,campaignId:null,termsVersion:"trip-v1",conditions:"Condiciones sintéticas aceptadas.",
 tripIncludes:["Hotel"],tripExcludes:["Vuelos"],rateId:"55555555-5555-4555-8555-555555555555",rateUsdPen:"3.7500",amountPenCents:93750,capacityLimit:2,
};
const stored={id:"66666666-6666-4666-8666-666666666666",runner_user_id:snapshot.userId,user_id:snapshot.userId,checkout_input_hash:snapshot.inputHash,input_hash:snapshot.inputHash,
 package_label:snapshot.packageLabel,offer_version:snapshot.offerVersion,offer_terms_version:snapshot.termsVersion,offer_conditions_snapshot:snapshot.conditions,
 trip_includes_snapshot:snapshot.tripIncludes,trip_excludes_snapshot:snapshot.tripExcludes,total_usd:1000,initial_payment_usd:250,
 checkout_rate_id:snapshot.rateId,checkout_rate_usd_pen:snapshot.rateUsdPen,checkout_amount_pen_cents:93750,reservation_expires_at:new Date("2026-10-29T18:30:00Z")};
describe("checkout reservation persistence",()=>{
 it("reclaims expired holds before creating a booking, counter and held allocation",async()=>{
  const execute=vi.fn(async(query:unknown)=>{void query; return {rows:[stored]};});
  vi.mocked(getDb).mockReturnValue({execute} as never);
  await expect(persistCheckoutReservation(snapshot)).resolves.toMatchObject({id:stored.id,offerVersion:1,quote:{principalUsd:250,amountPenCents:93750}});
  expect(execute).toHaveBeenCalledTimes(2);
  expect(execute.mock.calls[0]?.[0]).toHaveProperty("queryChunks");
  expect(execute.mock.calls[1]?.[0]).toHaveProperty("queryChunks");
 });
 it("maps capacity constraint failures without leaving a reservation",async()=>{
  const execute=vi.fn(async(query:unknown)=>{void query; return {rows:[]};});
  execute.mockResolvedValueOnce({rows:[]}).mockRejectedValueOnce({code:"23514",constraint:"offer_capacity_counters_count_chk"});
  vi.mocked(getDb).mockReturnValue({execute} as never);
  await expect(persistCheckoutReservation(snapshot)).resolves.toBe("sold_out");
  expect(execute).toHaveBeenCalledTimes(2);
 });
 it("reuses the same request only for the same authenticated owner and input",async()=>{
  const execute=vi.fn(async(query:unknown)=>{void query; return {rows:[] as typeof stored[]};});
  execute.mockResolvedValueOnce({rows:[]}).mockRejectedValueOnce({code:"23505",constraint:"bookings_checkout_request_uq"}).mockResolvedValueOnce({rows:[stored]});
  vi.mocked(getDb).mockReturnValue({execute} as never);
  await expect(persistCheckoutReservation(snapshot)).resolves.toMatchObject({id:stored.id});
  expect(execute).toHaveBeenCalledTimes(3);
  const mismatch={...snapshot,userId:"other-user"};
  execute.mockResolvedValueOnce({rows:[]}).mockRejectedValueOnce({code:"23505",constraint:"bookings_checkout_request_uq"}).mockResolvedValueOnce({rows:[stored]});
  await expect(persistCheckoutReservation(mismatch)).resolves.toBe("request_conflict");
 });
});
