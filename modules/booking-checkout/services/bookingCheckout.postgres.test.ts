// @vitest-environment node
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/db",()=>({getDb:vi.fn()}));
import { getDb } from "@/lib/db";
import { persistCheckoutReservation, type CheckoutReservationSnapshot } from "./bookingCheckout.service";

const enabled=process.env.CHECKOUT_POSTGRES_TESTS==="true";
const database="cv_stripe_checkout_f2_test";
const pool=new Pool({host:"127.0.0.1",port:55432,user:"postgres",database});
const adminId="checkout-f2-admin";
const tripId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const offerId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const rateId="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const leadIds=["cccccccc-cccc-4ccc-8ccc-cccccccccccc","eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"];
const users=["checkout-f2-runner-1","checkout-f2-runner-2"];
const requests=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"];

function snapshot(index:number):CheckoutReservationSnapshot {
 return {
  requestId:requests[index],inputHash:(index===0?"a":"b").repeat(64),userId:users[index],email:"runner"+(index+1)+"@example.invalid",
  leadId:leadIds[index],tripId,participantName:"Runner "+(index+1),packageLabel:"Carrera de prueba",distance:null,
  totalUsd:1000,initialPaymentUsd:250,balanceDueOn:"2027-01-01",offerVersionId:offerId,offerVersion:1,campaignId:null,
  termsVersion:"checkout-test-v1",conditions:"Condiciones sintéticas de la oferta.",
  tripIncludes:["Hotel"],tripExcludes:["Vuelos"],rateId,rateUsdPen:"3.7500",amountPenCents:93750,capacityLimit:1,simulated:false,
 };
}
describe.skipIf(!enabled)("checkout capacity on isolated PostgreSQL",()=>{
 beforeAll(async()=>{
  if(database!=="cv_stripe_checkout_f2_test") throw new Error("unsafe test database");
  const {rows}=await pool.query("select current_database() as name");
  if(rows[0].name!==database) throw new Error("wrong test database");
  await pool.query("delete from offer_capacity_allocations where booking_id in (select id from bookings where checkout_request_id=any($1::uuid[]))",[requests]);
  await pool.query("delete from booking_contract_acceptances where booking_id in (select id from bookings where checkout_request_id=any($1::uuid[]))",[requests]);
  await pool.query("delete from bookings where checkout_request_id=any($1::uuid[])",[requests]);
  await pool.query("delete from offer_capacity_counters where offer_version_id=$1",[offerId]);
  await pool.query("insert into profiles(user_id,email) values($1,$2) on conflict do nothing",[adminId,"checkout-admin@example.invalid"]);
  // The verified-email guard registers every runner's profile; the booking's created_by references it.
  for(let i=0;i<2;i++) await pool.query("insert into profiles(user_id,email) values($1,$2) on conflict do nothing",[users[i],"runner"+(i+1)+"@example.invalid"]);
  await pool.query("insert into trips(id,slug,title,city,country,race_date,distances,summary,includes,excludes,status) values($1,'checkout-test-trip','Carrera de prueba','Lima','Perú','2027-06-01',ARRAY['21K'],'Trip test',ARRAY['Hotel'],ARRAY['Vuelos'],'published') on conflict(id) do nothing",[tripId]);
  await pool.query("insert into exchange_rates(id,usd_pen,created_by) values($1,3.7500,$2) on conflict(id) do nothing",[rateId,adminId]);
  await pool.query("insert into trip_offers(id,trip_id,version,status,name,total_price_usd,discount_usd,deposit_options_usd,balance_due_on,valid_from,capacity_limit,terms_version,conditions,created_by,approved_by,approved_at,activated_by,activated_at) values($1,$2,1,'active','Oferta test',1000,0,ARRAY[250],'2027-01-01','2026-01-01',1,'checkout-test-v1','Condiciones sintéticas de la oferta.',$3,$3,now(),$3,now()) on conflict(id) do nothing",[offerId,tripId,adminId]);
  for(let i=0;i<2;i++) await pool.query("insert into leads(id,full_name,phone,email,trip_id,source,consent_version) values($1,$2,$3,$4,$5,'web_form','test-v1') on conflict(id) do nothing",[leadIds[i],"Runner "+(i+1),"+5199999999"+i,"runner"+(i+1)+"@example.invalid",tripId]);
  await pool.query("insert into offer_capacity_counters(offer_version_id,capacity_limit,allocated_count) values($1,1,0)",[offerId]);
  vi.mocked(getDb).mockReturnValue(drizzlePg(pool) as unknown as ReturnType<typeof getDb>);
 });
 afterAll(async()=>{await pool.end();});
 it("admits one reservation for the final seat and replays the winner without incrementing twice",async()=>{
  const results=await Promise.all([persistCheckoutReservation(snapshot(0)),persistCheckoutReservation(snapshot(1))]);
  expect(results.filter(value=>typeof value!=="string")).toHaveLength(1);
  expect(results.filter(value=>value==="sold_out")).toHaveLength(1);
  const index=typeof results[0]!=="string"?0:1;
  const winner=results[index] as Exclude<typeof results[number],string>;
  const repeated=await persistCheckoutReservation(snapshot(index));
  expect(repeated).toMatchObject({id:winner.id});
  const counter=await pool.query("select allocated_count from offer_capacity_counters where offer_version_id=$1",[offerId]);
  expect(counter.rows[0].allocated_count).toBe(1);
  const rows=await pool.query("select count(*)::int as count from offer_capacity_allocations where offer_version_id=$1 and status='held'",[offerId]);
  expect(rows.rows[0].count).toBe(1);
 });
 it("reclaims an expired abandoned hold exactly once before admitting the next runner",async()=>{
  const {rows:held}=await pool.query("select booking_id from offer_capacity_allocations where offer_version_id=$1 and status='held'",[offerId]);
  expect(held).toHaveLength(1);
  await pool.query("update bookings set status='pending',reservation_expires_at=now()-interval '1 minute' where id=$1",[held[0].booking_id]);
  await pool.query("update offer_capacity_allocations set expires_at=now()-interval '1 minute' where booking_id=$1",[held[0].booking_id]);
  const next={...snapshot(1),requestId:"33333333-3333-4333-8333-333333333333",inputHash:"c".repeat(64)};
  const admitted=await persistCheckoutReservation(next);
  expect(typeof admitted).not.toBe("string");
  const old=await pool.query("select booking.status,allocation.status as allocation_status from bookings booking join offer_capacity_allocations allocation on allocation.booking_id=booking.id where booking.id=$1",[held[0].booking_id]);
  expect(old.rows[0]).toEqual({status:"cancelled",allocation_status:"released"});
  const counter=await pool.query("select allocated_count from offer_capacity_counters where offer_version_id=$1",[offerId]);
  expect(counter.rows[0].allocated_count).toBe(1);
 });
 it("locks the booking before its seat, so a concurrent extension of the same hold keeps it",async()=>{
  const {rows:held}=await pool.query("select booking_id from offer_capacity_allocations where offer_version_id=$1 and status='held'",[offerId]);
  expect(held).toHaveLength(1);
  const heldId=held[0].booking_id as string;
  await pool.query("update bookings set status='pending',reservation_expires_at=now()-interval '1 minute' where id=$1",[heldId]);
  await pool.query("update offer_capacity_allocations set expires_at=now()-interval '1 minute' where booking_id=$1",[heldId]);
  const extension=await pool.connect();
  try{
   // Same order as the reservation extension: the booking row first, then its seat.
   await extension.query("begin");
   await extension.query("update bookings set reservation_expires_at=now()+interval '30 minutes' where id=$1",[heldId]);
   const sweeping=persistCheckoutReservation({...snapshot(0),requestId:requests[3],inputHash:"d".repeat(64)});
   const deadline=Date.now()+10_000;
   for(;;){
    const {rows:[waiting]}=await pool.query("select count(*)::int as n from pg_stat_activity where datname=$1 and wait_event_type='Lock' and query like '%expired_booking AS MATERIALIZED%'",[database]);
    if(waiting.n>0) break;
    if(Date.now()>deadline) throw new Error("the sweep did not wait for the booking lock");
    await new Promise(resolve=>setTimeout(resolve,25));
   }
   await extension.query("update offer_capacity_allocations set expires_at=now()+interval '30 minutes' where booking_id=$1",[heldId]);
   await extension.query("commit");
   await expect(sweeping).resolves.toBe("sold_out");
  }finally{extension.release();}
  const state=await pool.query("select booking.status,allocation.status as allocation_status from bookings booking join offer_capacity_allocations allocation on allocation.booking_id=booking.id where booking.id=$1",[heldId]);
  expect(state.rows[0]).toEqual({status:"pending",allocation_status:"held"});
  const counter=await pool.query("select allocated_count from offer_capacity_counters where offer_version_id=$1",[offerId]);
  expect(counter.rows[0].allocated_count).toBe(1);
 });
});
