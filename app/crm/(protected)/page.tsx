import { getCrmAccess } from "@/modules/accounts";

export default async function CrmHomePage() {
  const access = await getCrmAccess();
  if (access.status !== "ok") return null;

  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Bienvenido al CRM de Carreras Viajeras</h1>
      <p className="text-muted-foreground">Pronto verás aquí tus leads y viajes.</p>
    </section>
  );
}
