import "server-only";
import {createHash} from "node:crypto";
import {and,desc,eq,sql} from "drizzle-orm";
import {getDb} from "@/lib/db";
import {getStripeCheckoutConfig} from "@/lib/env";
import {contractVersions} from "@/lib/db-schema";
import {
 contractFormSchema,contractEditSchema,contractApprovalSchema,contractVersionKeySchema,
 type ContractInput,type ContractEdit,type ContractApproval,type ContractVersion,
} from "../schemas/contracts.schema";

// Draft contracts serve Checkout only in Stripe test mode with the explicit bypass flag, and only
// drafts that carry the test-document prefix. Live mode always uses approved versions.
const TEST_CONTRACT_PREFIX="BORRADOR DE PRUEBA SANDBOX";
export function isContractDraftAllowed():boolean {
 const config=getStripeCheckoutConfig();
 return config.enabled&&config.allowDraftContracts;
}
export function contractReviewHash(input:ContractInput):string {
 return createHash("sha256").update(JSON.stringify([input.versionKey,input.title,input.body])).digest("hex");
}
const columns={
 id:contractVersions.id,versionKey:contractVersions.versionKey,title:contractVersions.title,
 body:contractVersions.body,status:contractVersions.status,documentHash:contractVersions.documentHash,
 approvedAt:contractVersions.approvedAt,
};
type StoredVersion=Omit<ContractVersion,"reviewHash">;
function reviewed(row:StoredVersion):ContractVersion {
 const reviewHash=contractReviewHash(row);
 if(row.status==="approved"&&row.documentHash!==reviewHash) throw new Error("invalid approved contract");
 return {...row,reviewHash};
}
export async function createContractDraft(input:ContractInput,actorId:string):Promise<{id:string}|"version_exists"> {
 const parsed=contractFormSchema.parse(input);
 const rows=await getDb().insert(contractVersions).values({
  versionKey:parsed.versionKey,title:parsed.title,body:parsed.body,createdBy:actorId,
 }).onConflictDoNothing({target:contractVersions.versionKey}).returning({id:contractVersions.id});
 return rows[0]??"version_exists";
}
export async function updateContractDraft(input:ContractEdit):Promise<"updated"|"not_draft"> {
 const parsed=contractEditSchema.parse(input);
 const rows=await getDb().update(contractVersions).set({title:parsed.title,body:parsed.body,updatedAt:sql`now()`})
 .where(and(eq(contractVersions.id,parsed.id),eq(contractVersions.status,"draft"))).returning({id:contractVersions.id});
 return rows.length?"updated":"not_draft";
}
export async function approveContractVersion(input:ContractApproval,actorId:string):Promise<"approved"|"not_found"|"not_draft"|"changed"> {
 const parsed=contractApprovalSchema.safeParse(input);
 if(!parsed.success) return "not_found";
 const db=getDb();
 const [current]=await db.select(columns).from(contractVersions).where(eq(contractVersions.id,parsed.data.id)).limit(1);
 if(!current) return "not_found";
 if(current.status!=="draft") return "not_draft";
 if(contractReviewHash(current)!==parsed.data.documentHash) return "changed";
 const rows=await db.update(contractVersions).set({
  status:"approved",documentHash:parsed.data.documentHash,approvedBy:actorId,approvedAt:sql`now()`,updatedAt:sql`now()`,
 }).where(and(
  eq(contractVersions.id,current.id),eq(contractVersions.status,"draft"),
  eq(contractVersions.versionKey,current.versionKey),eq(contractVersions.title,current.title),eq(contractVersions.body,current.body),
 )).returning({id:contractVersions.id});
 return rows.length?"approved":"changed";
}
export async function listContractVersions():Promise<ContractVersion[]> {
 const rows=await getDb().select(columns).from(contractVersions)
 .orderBy(desc(contractVersions.createdAt),desc(contractVersions.id)).limit(20);
 return rows.map(reviewed);
}
export async function getApprovedContractVersion(versionKey:string):Promise<ContractVersion|null> {
 const parsed=contractVersionKeySchema.safeParse(versionKey);
 if(!parsed.success) return null;
 const [row]=await getDb().select(columns).from(contractVersions)
 .where(and(eq(contractVersions.versionKey,parsed.data),eq(contractVersions.status,"approved"))).limit(1);
 return row?reviewed(row):null;
}
export async function getCheckoutContractVersion(versionKey:string):Promise<ContractVersion|null> {
 const approved=await getApprovedContractVersion(versionKey);
 if(approved||!isContractDraftAllowed()) return approved;
 const parsed=contractVersionKeySchema.safeParse(versionKey);
 if(!parsed.success) return null;
 const [row]=await getDb().select(columns).from(contractVersions)
  .where(and(eq(contractVersions.versionKey,parsed.data),eq(contractVersions.status,"draft"))).limit(1);
 return row&&row.body.startsWith(TEST_CONTRACT_PREFIX)?reviewed(row):null;
}
