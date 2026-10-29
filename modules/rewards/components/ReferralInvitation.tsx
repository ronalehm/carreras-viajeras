import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ReferralCode } from "./ReferralCode";

export function ReferralInvitation({ code }: { code: string }) {
  return <section className="mx-auto grid w-full max-w-2xl gap-6 px-5 py-14 sm:py-20">
    <h1 className="text-3xl font-bold">Un runner te invita a viajar</h1>
    <p>Copia este código y entra en tu cuenta. Tras verificar tu correo, pégalo en Mi cuenta → Referidos y revisa las condiciones antes de aceptarlo.</p>
    <ReferralCode code={code} />
    <p className="text-sm text-muted-foreground">Abrir o compartir este enlace no registra una atribución ni concede estrellas. El hito del programa es una reserva confirmada y su primer pago positivo no anulado; aplican la regla vigente y sus condiciones.</p>
    <div className="flex flex-wrap gap-3"><Link href="/cuenta" className={buttonVariants()}>Entrar o crear mi cuenta</Link><Link href="/cuenta/perfil#referidos" className={buttonVariants({ variant: "outline" })}>Ya tengo mi cuenta</Link></div>
  </section>;
}
