// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";
import {drizzle} from "drizzle-orm/neon-http";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/db",()=>({getDb:vi.fn()}));
vi.mock("@/lib/env",()=>({getStripeCheckoutConfig:vi.fn()}));
import {getDb} from "@/lib/db";
import {getStripeCheckoutConfig,type StripeCheckoutConfig} from "@/lib/env";
import {contractReviewHash,createContractDraft,updateContractDraft,approveContractVersion,getApprovedContractVersion,getCheckoutContractVersion,listContractVersions} from "./contracts.service";

const id="11111111-1111-4111-8111-111111111111";
const input={versionKey:"viaje-2027-v1",title:"Contrato de prueba",body:"Texto sintético para verificar el contrato, sin datos personales."};
function fake(responses:unknown[][]=[]){
 const queries:{sql:string;params:unknown[]}[]=[];
 const query=vi.fn(async(sql:string,params:unknown[])=>{queries.push({sql,params});return {rows:responses[queries.length-1]??[]};});
 vi.mocked(getDb).mockReturnValue(drizzle(Object.assign(query,{transaction:vi.fn()} ) as never) as ReturnType<typeof getDb>);
 return queries;
}
const row=(status="draft",hash:string|null=null)=>[id,input.versionKey,input.title,input.body,status,hash,null];
const testConfig:StripeCheckoutConfig={enabled:true,mode:"test",secretKey:"sk_test_unit",webhookSecret:null,allowDraftContracts:false,disabledReason:null};
function stripeConfig(overrides:Partial<StripeCheckoutConfig>={}){vi.mocked(getStripeCheckoutConfig).mockReturnValue({...testConfig,...overrides});}
beforeEach(()=>{vi.mocked(getDb).mockReset();stripeConfig();});

describe("versioned contracts",()=>{
 it("manages contracts with Checkout switched off, so live terms can be approved before go-live",async()=>{
  stripeConfig({enabled:false,mode:"live",disabledReason:"not_enabled"});
  const queries=fake([[[id]],[]]);
  await expect(createContractDraft(input,"admin")).resolves.toEqual({id});
  await expect(listContractVersions()).resolves.toEqual([]);
  expect(queries).toHaveLength(2);
 });
 it("binds a review fingerprint to version, title and text",()=>{
  const hashes=[input,{...input,versionKey:"viaje-2027-v2"},{...input,title:"Otro título"},{...input,body:input.body+" Cambio."}].map(contractReviewHash);
  expect(new Set(hashes).size).toBe(4);
  for(const hash of hashes)expect(hash).toMatch(/^[a-f0-9]{64}$/);
 });
 it("inserts only a draft authored by the authenticated actor",async()=>{
  const queries=fake([[[id]]]);
  await expect(createContractDraft(input,"trusted-admin")).resolves.toEqual({id});
  expect(queries[0].params).toContain("trusted-admin");
  expect(queries[0].params).not.toContain("approved");
  expect(queries[0].sql).toContain("on conflict");
 });
 it("returns a version conflict without overwriting an existing contract",async()=>{
  fake([[]]);await expect(createContractDraft(input,"admin")).resolves.toBe("version_exists");
 });
 it("guards draft updates instead of modifying approved text",async()=>{
  const queries=fake([[]]);
  await expect(updateContractDraft({id,title:input.title,body:input.body})).resolves.toBe("not_draft");
  expect(queries).toHaveLength(1);
  expect(queries[0].sql).toMatch(/where[\s\S]*status/);
  expect(queries[0].params).toContain("draft");
 });
 it("does not approve text different from what the admin reviewed",async()=>{
  const queries=fake([[row()]]);
  await expect(approveContractVersion({id,documentHash:contractReviewHash({...input,body:"Otro documento sintético no revisado."})},"admin")).resolves.toBe("changed");
  expect(queries).toHaveLength(1);
 });
 it("atomically approves only the exact reviewed draft",async()=>{
  const queries=fake([[row()],[[id]]]);
  const hash=contractReviewHash(input);
  await expect(approveContractVersion({id,documentHash:hash},"trusted-admin")).resolves.toBe("approved");
  expect(queries).toHaveLength(2);
  expect(queries[1].params).toEqual(expect.arrayContaining(["approved",hash,"trusted-admin","draft",input.body,input.title,input.versionKey]));
 });
 it("reports a concurrent draft change rather than approving a stale read",async()=>{
  fake([[row()],[]]);
  await expect(approveContractVersion({id,documentHash:contractReviewHash(input)},"admin")).resolves.toBe("changed");
 });
 it("never reapproves an approved version",async()=>{
  fake([[row("approved",contractReviewHash(input))]]);
  await expect(approveContractVersion({id,documentHash:contractReviewHash(input)},"admin")).resolves.toBe("not_draft");
 });
 it("returns only an approved contract with a matching stored fingerprint",async()=>{
  const hash=contractReviewHash(input);fake([[row("approved",hash)]]);
  await expect(getApprovedContractVersion(input.versionKey)).resolves.toMatchObject({status:"approved",documentHash:hash,reviewHash:hash});
  fake([[row("approved","0".repeat(64))]]);
  await expect(getApprovedContractVersion(input.versionKey)).rejects.toThrow("invalid approved contract");
 });
 it("rejects malformed identifiers before querying",async()=>{
  fake();await expect(approveContractVersion({id:"bad",documentHash:"bad"},"admin")).resolves.toBe("not_found");
  expect(getDb).not.toHaveBeenCalled();
 });
});


describe("draft contracts in Checkout",()=>{
 const testBody="BORRADOR DE PRUEBA SANDBOX — SIN APROBACIÓN LEGAL NI COMERCIAL\nOferta de prueba.";
 it("never serves a draft in live mode, even with a draft row present",async()=>{
  stripeConfig({mode:"live",allowDraftContracts:false});
  const queries=fake([[],[[id,input.versionKey,input.title,testBody,"draft",null,null]]]);
  await expect(getCheckoutContractVersion(input.versionKey)).resolves.toBeNull();expect(queries).toHaveLength(1);
 });
 it("never serves a draft while Checkout is disabled",async()=>{
  stripeConfig({enabled:false,allowDraftContracts:true,disabledReason:"not_enabled"});
  const queries=fake([[],[[id,input.versionKey,input.title,testBody,"draft",null,null]]]);
  await expect(getCheckoutContractVersion(input.versionKey)).resolves.toBeNull();expect(queries).toHaveLength(1);
 });
 it("serves a marked draft only when the configuration allows drafts (test mode and explicit flag)",async()=>{
  stripeConfig({allowDraftContracts:true});
  const queries=fake([[],[[id,input.versionKey,input.title,testBody,"draft",null,null]]]);
  await expect(getCheckoutContractVersion(input.versionKey)).resolves.toMatchObject({status:"draft",documentHash:null,body:testBody,reviewHash:contractReviewHash({...input,body:testBody})});
  expect(queries).toHaveLength(2);
 });
 it("never serves a draft without the test-document marker",async()=>{
  stripeConfig({allowDraftContracts:true});
  fake([[],[[id,input.versionKey,input.title,input.body,"draft",null,null]]]);
  await expect(getCheckoutContractVersion(input.versionKey)).resolves.toBeNull();
 });
 it("prefers the approved version over any draft",async()=>{
  stripeConfig({allowDraftContracts:true});
  const hash=contractReviewHash(input);const queries=fake([[row("approved",hash)]]);
  await expect(getCheckoutContractVersion(input.versionKey)).resolves.toMatchObject({status:"approved"});
  expect(queries).toHaveLength(1);
 });
});
