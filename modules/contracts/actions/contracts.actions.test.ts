// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/auth/guards",()=>({requirePermission:vi.fn()}));
vi.mock("../services/contracts.service",()=>({
 createContractDraft:vi.fn(),updateContractDraft:vi.fn(),approveContractVersion:vi.fn(),
}));
import {revalidatePath} from "next/cache";
import {requirePermission} from "@/lib/auth/guards";
import {ForbiddenError,UnauthorizedError} from "@/lib/auth/errors";
import {createContractDraft,updateContractDraft,approveContractVersion} from "../services/contracts.service";
import {createContractAction,updateContractAction,approveContractAction} from "./contracts.actions";

const idle={status:"idle"} as const;
const id="11111111-1111-4111-8111-111111111111";
const input={versionKey:"VIAJE-2027-V1",title:"Contrato de prueba",body:"Condiciones sintéticas para esta prueba de contrato."};
function form(fields:Record<string,string>){const data=new FormData();for(const [name,value] of Object.entries(fields))data.set(name,value);return data;}
beforeEach(()=>{
 vi.resetAllMocks();
 vi.mocked(requirePermission).mockResolvedValue({id:"trusted-admin",email:"admin@example.test",emailVerified:true,staffRoles:["admin"]});
 vi.mocked(createContractDraft).mockResolvedValue({id});
 vi.mocked(updateContractDraft).mockResolvedValue("updated");
 vi.mocked(approveContractVersion).mockResolvedValue("approved");
});

describe("contract server actions",()=>{
 it.each([new UnauthorizedError(),new ForbiddenError()])("rechecks the existing admin permission for every call",async(error)=>{
  vi.mocked(requirePermission).mockRejectedValue(error);
  expect(await createContractAction(idle,form(input))).toMatchObject({status:"error"});
  expect(requirePermission).toHaveBeenCalledWith("offers.manage");
  expect(createContractDraft).not.toHaveBeenCalled();
 });
 it("validates the document before any write",async()=>{
  const result=await createContractAction(idle,form({...input,body:"corto"}));
  expect(result).toMatchObject({status:"error",fieldErrors:{body:expect.any(Array)}});
  expect(createContractDraft).not.toHaveBeenCalled();
 });
 it("uses the server identity and ignores forged audit fields",async()=>{
  const result=await createContractAction(idle,form({...input,createdBy:"intruder",status:"approved"}));
  expect(result.status).toBe("success");
  expect(createContractDraft).toHaveBeenCalledWith({...input,versionKey:"viaje-2027-v1"},"trusted-admin");
  expect(revalidatePath).toHaveBeenCalledWith("/crm/contratos");
 });
 it("does not expose database errors or submitted values",async()=>{
  vi.mocked(createContractDraft).mockRejectedValue(new Error("private database connection details"));
  const result=await createContractAction(idle,form(input));
  expect(result.status).toBe("error");
  expect(JSON.stringify(result)).not.toContain("private database");
  expect(JSON.stringify(result)).not.toContain(input.body);
  expect(revalidatePath).not.toHaveBeenCalled();
 });
 it("keeps approved documents immutable through the update action",async()=>{
  vi.mocked(updateContractDraft).mockResolvedValue("not_draft");
  expect(await updateContractAction(idle,form({id,title:input.title,body:input.body}))).toMatchObject({status:"error"});
  expect(revalidatePath).not.toHaveBeenCalled();
 });
 it("requires the reviewed document hash and trusted actor when approving",async()=>{
  expect(await approveContractAction(idle,form({id}))).toMatchObject({status:"error"});
  expect(approveContractVersion).not.toHaveBeenCalled();
  expect((await approveContractAction(idle,form({id,documentHash:"a".repeat(64)}))).status).toBe("success");
  expect(approveContractVersion).toHaveBeenCalledWith({id,documentHash:"a".repeat(64)},"trusted-admin");
 });
 it("makes a concurrent text change visible instead of announcing approval",async()=>{
  vi.mocked(approveContractVersion).mockResolvedValue("changed");
  const result=await approveContractAction(idle,form({id,documentHash:"a".repeat(64)}));
  expect(result).toMatchObject({status:"error"});
  expect(revalidatePath).not.toHaveBeenCalled();
 });
});
