import { requirePermission } from "@/lib/auth/guards";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createCatalogVersionAction, createRewardRuleAction, deactivateCatalogVersionAction, deactivateRewardRuleAction } from "../actions/rewards.actions";
import { saveWelcomeDiscountAction } from "../actions/welcomeDiscount.actions";
import { listProgramConfiguration } from "../services/rewards.service";
import type { ActiveWelcomeDiscount, WelcomeDiscountVersion } from "../services/welcomeDiscount.service";
import { RewardCatalogDetails, RewardRuleDetails, rewardInstant, rewardMoney } from "./RewardDetails";
import { RewardMutationForm, type RewardFormField } from "./RewardMutationForm";
import { WelcomeDiscountForm } from "./WelcomeDiscountForm";

const DATE_FIELDS: RewardFormField[] = [
  { name: "validFrom", label: "Fecha de inicio (Lima)", type: "date", required: true },
  { name: "validUntil", label: "Fecha final (Lima)", type: "date", hint: "Opcional. Deja vacío para no fijar una fecha final." },
];

// Read by the page's Server Component. null means the welcome discount could not be loaded.
export type WelcomeDiscountAdminData = { active: ActiveWelcomeDiscount | null; versions: WelcomeDiscountVersion[] };

function days(value: number) { return `${value} ${value === 1 ? "día" : "días"}`; }

function WelcomeDiscountSection({ data }: { data: WelcomeDiscountAdminData | null }) {
  return <section className="grid gap-4 rounded-xl border p-5" aria-labelledby="welcome-discount-heading">
    <h2 id="welcome-discount-heading" className="text-lg font-semibold">Descuento de bienvenida</h2>
    {data === null ? <p role="alert">No se pudo cargar el descuento de bienvenida. Vuelve a intentarlo.</p> : <>
      <p className="text-sm font-medium">{data.active ? `Activo: ${rewardMoney(data.active.amountUsd)}, válido ${days(data.active.validityDays)}` : "Desactivado"}</p>
      <WelcomeDiscountForm action={saveWelcomeDiscountAction} current={data.active} />
      <div className="grid gap-2">
        <h3 className="font-medium">Últimas versiones</h3>
        {data.versions.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay versiones guardadas.</p> : <Table>
          <TableHeader><TableRow><TableHead>Fecha (Lima)</TableHead><TableHead>Importe</TableHead><TableHead>Vigencia</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
          <TableBody>{data.versions.slice(0, 5).map((version) => <TableRow key={version.id}>
            <TableCell>{rewardInstant(version.createdAt)}</TableCell>
            <TableCell>{rewardMoney(version.amountUsd)}</TableCell>
            <TableCell>{days(version.validityDays)}</TableCell>
            <TableCell><Badge variant={version.active ? "default" : "outline"}>{version.active ? "Activa" : "Inactiva"}</Badge></TableCell>
          </TableRow>)}</TableBody>
        </Table>}
      </div>
    </>}
  </section>;
}

export async function RewardProgramAdmin({ welcomeDiscount }: { welcomeDiscount: WelcomeDiscountAdminData | null }) {
  let configuration;
  try {
    await requirePermission("rewards.manage");
    configuration = await listProgramConfiguration();
  } catch {
    return <p role="alert">No se pudo cargar la configuración de recompensas. Vuelve a intentarlo.</p>;
  }
  const families = [...new Map(configuration.catalog.map((item) => [item.catalogKey, { value: item.catalogKey, label: item.title }])).values()];
  return <div className="grid gap-8">
    <WelcomeDiscountSection data={welcomeDiscount} />
    <p className="text-sm text-muted-foreground">Cada cambio crea una versión. Los referidos y canjes existentes conservan sus condiciones. Las versiones desactivadas siguen en el historial. Las fechas usan la zona horaria de Lima.</p>
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <section className="grid gap-4 rounded-xl border p-5" aria-labelledby="new-rule-heading"><h2 id="new-rule-heading" className="text-lg font-semibold">Nueva versión de regla</h2>
        <p className="text-sm">El hito es una reserva confirmada y su primer pago positivo no anulado. No se conceden estrellas por un registro o lead.</p>
        <RewardMutationForm action={createRewardRuleAction} label="Crear versión de regla" fields={[
          { name: "pointsPerReferral", label: "Estrellas por referido elegible", type: "number", required: true },
          { name: "maxReferralsPerRunner", label: "Máximo de referidos por runner", type: "number", hint: "Opcional. Vacío significa sin límite configurado." },
          ...DATE_FIELDS,
          { name: "terms", label: "Condiciones de elegibilidad y límites", type: "textarea", required: true, hint: "Explica las condiciones que aceptará el referido. Entre 10 y 4000 caracteres." },
          { name: "active", label: "Activar esta versión al crearla", type: "checkbox", hint: "Sin marcar se guarda como inactiva. Para activarla después, crea una nueva versión." },
        ]} />
      </section>
      <section className="grid gap-4 rounded-xl border p-5" aria-labelledby="new-prize-heading"><h2 id="new-prize-heading" className="text-lg font-semibold">Nueva versión de premio</h2>
        <RewardMutationForm action={createCatalogVersionAction} label="Crear versión de premio" fields={[
          { name: "catalogKey", label: "Premio", type: "select", options: families, hint: "Deja sin seleccionar para crear un premio nuevo, o elige uno existente para añadir una versión." },
          { name: "title", label: "Título del premio", required: true },
          { name: "description", label: "Condiciones del premio", type: "textarea", required: true },
          { name: "kind", label: "Tipo de premio", type: "select", required: true, options: [{ value: "discount", label: "Descuento fijo en USD" }, { value: "benefit", label: "Beneficio no monetario" }] },
          { name: "costStars", label: "Coste en estrellas", type: "number", required: true },
          { name: "discountUsd", label: "Descuento en USD enteros", type: "number", hint: "Obligatorio para descuentos. Déjalo vacío para beneficios no monetarios." },
          { name: "stock", label: "Tope de unidades del premio entre versiones", type: "number", hint: "Opcional. Vacío significa sin tope configurado." },
          { name: "maxPerRunner", label: "Máximo de canjes por runner", type: "number", required: true },
          { name: "redemptionDays", label: "Vigencia del canje en días", type: "number", required: true },
          ...DATE_FIELDS,
          { name: "active", label: "Activar esta versión al crearla", type: "checkbox", hint: "Sin marcar se guarda como inactiva. La versión publicada no se edita." },
        ]} />
      </section>
    </div>
    <section className="grid gap-4" aria-labelledby="rule-history-heading"><h2 id="rule-history-heading" className="text-lg font-semibold">Historial de reglas</h2>
      {configuration.rules.length === 0 ? <p className="text-sm text-muted-foreground">No hay reglas configuradas.</p> : configuration.rules.map((rule) => <article key={rule.id} className="grid gap-4 rounded-xl border p-5">
        <h3 className="font-medium">Versión {rule.version} · {rule.active ? "Activa según su vigencia" : "Inactiva"}</h3><RewardRuleDetails rule={rule} />
        {rule.active && <ConfirmActionButton action={deactivateRewardRuleAction} fields={{ id: rule.id }} label="Desactivar regla" title="Desactivar esta regla" description="Dejará de aceptar nuevas atribuciones. Las atribuciones existentes conservan su versión y condiciones." confirmLabel="Desactivar" variant="destructive" />}
      </article>)}
      {configuration.rules.length === 100 && <p className="text-sm text-muted-foreground">Se muestran las 100 versiones más recientes.</p>}
    </section>
    <section className="grid gap-4" aria-labelledby="prize-history-heading"><h2 id="prize-history-heading" className="text-lg font-semibold">Historial del catálogo</h2>
      {configuration.catalog.length === 0 ? <p className="text-sm text-muted-foreground">No hay premios configurados.</p> : configuration.catalog.map((item) => <article key={item.id} className="grid gap-4 rounded-xl border p-5">
        <h3 className="font-medium">{item.title} · v{item.version} · {item.active ? "Activa según su vigencia" : "Inactiva"}</h3><RewardCatalogDetails item={item} />
        {item.active && <ConfirmActionButton action={deactivateCatalogVersionAction} fields={{ id: item.id }} label="Desactivar premio" title="Desactivar esta versión del premio" description="No admitirá nuevos canjes. Los canjes ya emitidos conservan sus condiciones." confirmLabel="Desactivar" variant="destructive" />}
      </article>)}
      {configuration.catalog.length === 100 && <p className="text-sm text-muted-foreground">Se muestran las 100 versiones más recientes.</p>}
    </section>
  </div>;
}
