// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ActiveOffer } from "@/modules/trips";
import { createCheckoutQuote } from "./quote.service";

const offer: ActiveOffer = {
  offerVersionId:"11111111-1111-4111-8111-111111111111",tripId:"22222222-2222-4222-8222-222222222222",
  campaignId:null,version:1,totalPriceUsd:1200,discountUsd:200,finalPriceUsd:1000,depositOptionsUsd:[250,500],
  balanceDueOn:"2027-01-01",bonusDescription:null,validFrom:"2026-01-01",validUntil:null,capacityLimit:5,
  termsVersion:"trip-v1",conditions:"Condiciones sintéticas para una cotización.",
  approvedAt:new Date(),activatedAt:new Date(),
};
const rate={id:"33333333-3333-4333-8333-333333333333",usdPen:"3.7500",effectiveFrom:new Date()};
describe("checkout quote",()=>{
  it("uses the existing exact USD-to-PEN arithmetic and snapshots the rate identity",()=>{
    expect(createCheckoutQuote(offer,{kind:"full"},rate)).toMatchObject({totalUsd:1000,principalUsd:1000,rateId:rate.id,rateUsdPen:"3.7500",amountPenCents:375000});
  });
  it("resolves only an offered deposit index and retains the remaining USD balance",()=>{
    expect(createCheckoutQuote(offer,{kind:"deposit",index:1},rate)).toMatchObject({principalUsd:500,balanceUsd:500,amountPenCents:187500});
    expect(()=>createCheckoutQuote(offer,{kind:"deposit",index:2},rate)).toThrow("invalid payment choice");
  });
  it("quotes the Santiago USD 300 deposit in PEN at the current USD/PEN rate",()=>{
    const santiago={...offer,totalPriceUsd:11000,discountUsd:0,finalPriceUsd:11000,depositOptionsUsd:[300]};
    const currentRate={...rate,usdPen:"3.4500"};
    expect(createCheckoutQuote(santiago,{kind:"deposit",index:0},currentRate)).toMatchObject({
      totalUsd:11000,principalUsd:300,balanceUsd:10700,rateUsdPen:"3.4500",amountPenCents:103500,
    });
  });
  it("refuses to quote when there is no current exchange rate",()=>{
    expect(()=>createCheckoutQuote(offer,{kind:"full"},null)).toThrow("exchange rate unavailable");
  });
});

import { beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/neon-http";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/db",()=>({getDb:vi.fn()}));
import { getDb } from "@/lib/db";
import { getCurrentCheckoutRate } from "./quote.service";

describe("current checkout rate",()=>{
 beforeEach(()=>vi.mocked(getDb).mockReset());
 it("returns the newest rate with its id and canonical decimal text",async()=>{
  const query=vi.fn(async()=>({rows:[["33333333-3333-4333-8333-333333333333","3.75","2026-10-29T12:00:00Z"]]}));
  vi.mocked(getDb).mockReturnValue(drizzle(Object.assign(query,{transaction:vi.fn()}) as never) as ReturnType<typeof getDb>);
  await expect(getCurrentCheckoutRate()).resolves.toEqual({id:"33333333-3333-4333-8333-333333333333",usdPen:"3.7500",effectiveFrom:new Date("2026-10-29T12:00:00Z")});
 });
});
