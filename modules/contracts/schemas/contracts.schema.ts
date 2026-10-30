import { z } from "zod";

const documentBody = z.string().transform(value => value.replace(/\r\n?/g, "\n").trim())
 .pipe(z.string().min(20, "El contrato debe tener al menos 20 caracteres.").max(50000, "El contrato es demasiado extenso."));
const title = z.string().trim().min(2, "Escribe un título.").max(140, "El título es demasiado extenso.");
export const contractVersionKeySchema = z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const contractStatusSchema = z.enum(["draft", "approved"]);
export const contractFormSchema = z.object({versionKey:contractVersionKeySchema,title,body:documentBody}).strict();
export const contractEditSchema = z.object({id:z.uuid(),title,body:documentBody}).strict();
export const contractApprovalSchema = z.object({id:z.uuid(),documentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type ContractInput = z.infer<typeof contractFormSchema>;
export type ContractEdit = z.infer<typeof contractEditSchema>;
export type ContractApproval = z.infer<typeof contractApprovalSchema>;
export type ContractVersion = ContractInput & {id:string;status:z.infer<typeof contractStatusSchema>;documentHash:string|null;reviewHash:string;approvedAt:Date|null};
export type ContractActionState = {status:"idle"} | {status:"success";message:string} | {status:"error";message:string;fieldErrors?:Record<string,string[]>};
