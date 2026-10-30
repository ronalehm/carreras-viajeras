import {cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import type {ContractActionState,ContractVersion} from "../schemas/contracts.schema";
import {ContractManager} from "./ContractManager";

afterEach(cleanup);
const draft:ContractVersion={id:"11111111-1111-4111-8111-111111111111",versionKey:"viaje-2027-v1",title:"Contrato de prueba",body:"Texto sintético guardado que el administrador debe revisar.",status:"draft",documentHash:null,reviewHash:"a".repeat(64),approvedAt:null};
function actions(){
 const success=async(previous:ContractActionState,data:FormData):Promise<ContractActionState>=>{void previous;void data;return {status:"success",message:"Guardado."};};
 return {createAction:vi.fn(success),updateAction:vi.fn(success),approveAction:vi.fn(success)};
}
describe("native contract administration",()=>{
 it("renders approved text as text, without editable fields or executable markup",()=>{
  const body="<script>untrusted()</script> Documento de prueba aprobado.";
  const approved:ContractVersion={...draft,id:"22222222-2222-4222-8222-222222222222",versionKey:"otro-2027-v1",body,status:"approved",documentHash:"b".repeat(64),reviewHash:"b".repeat(64),approvedAt:new Date("2026-10-29T10:00:00Z")};
  const {container}=render(<ContractManager contracts={[approved]} {...actions()}/>);
  expect(screen.getByText(body).textContent).toBe(body);
  expect(container.querySelector("script")).toBeNull();
  expect(screen.queryByRole("button",{name:"Aprobar versión"})).toBeNull();
  expect(screen.queryByDisplayValue(body)).toBeNull();
 });
 it("preserves typed values after a rejected create and disables duplicate submission",async()=>{
  let resolve!:(value:ContractActionState)=>void;
  const pending=new Promise<ContractActionState>(done=>{resolve=done;});
  const callbacks=actions();callbacks.createAction.mockImplementation(()=>pending);
  render(<ContractManager contracts={[]} {...callbacks}/>);
  const form=screen.getByRole("form",{name:"Nuevo contrato"});
  const title=within(form).getByLabelText("Título") as HTMLInputElement;
  fireEvent.change(within(form).getByLabelText("Versión"),{target:{value:"viaje-2027-v1"}});
  fireEvent.change(title,{target:{value:"Título que debo conservar"}});
  fireEvent.change(within(form).getByLabelText("Texto del contrato"),{target:{value:draft.body}});
  fireEvent.submit(form);
  await waitFor(()=>expect((within(form).getByRole("button",{name:"Guardando…"}) as HTMLButtonElement).disabled).toBe(true));
  resolve({status:"error",message:"Revisa el contrato."});
  await waitFor(()=>expect(screen.getByRole("alert").textContent).toBe("Revisa el contrato."));
  expect(title.value).toBe("Título que debo conservar");
 });
 it("does not allow approval of unsaved edits",()=>{
  render(<ContractManager contracts={[draft]} {...actions()}/>);
  expect(screen.getByRole("button",{name:"Aprobar versión"})).not.toBeNull();
  const form=screen.getByRole("form",{name:"Editar viaje-2027-v1"});
  fireEvent.change(within(form).getByLabelText("Título"),{target:{value:"Cambio sin guardar"}});
  expect(screen.queryByRole("button",{name:"Aprobar versión"})).toBeNull();
 });
 it("uses the existing confirmation dialog and submits the stored fingerprint",async()=>{
  const callbacks=actions();render(<ContractManager contracts={[draft]} {...callbacks}/>);
  fireEvent.click(screen.getByRole("button",{name:"Aprobar versión"}));
  const dialog=await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button",{name:"Aprobar texto guardado"}));
  await waitFor(()=>expect(callbacks.approveAction).toHaveBeenCalledTimes(1));
  const data=callbacks.approveAction.mock.calls[0]?.[1];
  expect(data?.get("id")).toBe(draft.id);
  expect(data?.get("documentHash")).toBe(draft.reviewHash);
  expect(data?.has("body")).toBe(false);
 });
});
