# Mi cuenta del runner: carreras, beneficios y referidos con recompensas

- Módulo: accounts, bookings, rewards
- Estado: borrador
- Origen: petición del usuario del 29 de octubre de 2026.
- Base: integración del PR #22 con Clerk y configuración de Codex. El usuario
  confirmó el hito de reserva más primer pago y las reglas configurables en CRM;
  las condiciones concretas de activación se detallan al final.
- Alcance relacionado: [Noticias y actualizaciones públicas](landing-news-updates.md),
  añadido por el usuario para la landing; se desarrolla como módulo editorial propio.

## Objetivo

El runner debe encontrar desde su perfil sus carreras registradas, los beneficios
que realmente le corresponden y un mecanismo para recomendar Carreras Viajeras a
otros runners, consultar las estrellas que haya ganado y canjear recompensas.
El perfil deja de ser únicamente un formulario de datos personales.

## Reutilización y precedencia

- Clerk identifica; Neon conserva datos y autorizaciones. No se crea un rol runner.
- Se conservan el editor de `/cuenta/perfil`, su consentimiento y sus datos privados.
- `loadRunnerPortal` ya vincula reservas sin cuenta por correo primario verificado
  y después consulta únicamente por `runner_user_id`. Se reutiliza ese contrato.
- `runner-portal.md` F5–F6 y el PR #33 contienen el trabajo de `/mis-carreras`.
  Se revisará e incorporará selectivamente su UI y utilidades, conservando las
  guardas de Clerk actuales. No se importan guardas Neon Auth ni refactors ajenos
  de esa rama. El nombre opcional del saludo no autoriza ni bloquea el acceso.
- Las exclusiones de estrellas/recompensas de las specs anteriores se sustituyen
  únicamente por el alcance aprobado de este documento; no se editan esas specs.
- `leads.referred_by` es información comercial libre, no una atribución de cuentas
  ni evidencia suficiente para conceder estrellas.

## Alcance

Incluye una cuenta privada con Mis carreras, Beneficios, Referidos y Mi perfil;
enlace/código personal de referido; atribución confirmada por el referido;
reglas y catálogo configurables; movimientos auditables de estrellas y canjes
idempotentes; aplicación controlada de descuentos a reservas propias elegibles.

No incluye muro social, reseñas, puntos por publicar o simplemente participar,
pasarela de pago, envío automático de mensajes a contactos ni monedas nuevas.
Las únicas recompensas que se anuncian como disponibles serán las activadas con
condiciones concretas. No se inventan equivalencias, saldos o descuentos de demo.

Las noticias y actualizaciones de la landing son públicas. No sustituyen los
avisos privados del itinerario ni publican reservas, beneficios individuales o
datos de referidos. Leer o publicar noticias no concede estrellas en este alcance.

## Experiencia del runner

`/cuenta` conserva el acceso con Clerk. La propuesta es que el destino posterior
del runner sea `/cuenta/perfil`, que se presenta como **Mi cuenta** y muestra:

1. **Mis carreras:** reservas propias pendientes, confirmadas, terminadas y
   canceladas, con carrera, fecha, destino y estado. Detalle canónico en
   `/mis-carreras?reserva=<id>`: paquete, pagos, itinerario y avisos ya definidos.
2. **Beneficios:** ventajas asignadas de sus reservas y recompensas personales
   disponibles, reservadas, utilizadas, vencidas o anuladas, con sus condiciones.
3. **Referidos:** enlace/código para compartir, explicación de la regla vigente,
   estados y cantidades agregadas de sus referidos y movimientos de estrellas.
4. **Mi perfil:** el formulario existente, sin duplicarlo ni mezclar documentos o
   datos médicos con las consultas de beneficios, referidos o directorios.

La navegación será accesible y usable en móvil, con estados de carga, vacío y error.
No se enlaza a `/mis-carreras` hasta que su implementación exista en el árbol.
Un fallo de lectura se muestra como error; nunca se sustituye por saldo cero,
lista vacía o beneficios inexistentes para aparentar una carga correcta.
Un formulario de contacto, lead o interés en un viaje no se presenta como una
carrera registrada. No se añaden participaciones autodeclaradas en esta entrega.

La elección del hub como destino sustituye puntualmente el destino directo a
`/mis-carreras` de runner-portal F6; staff conserva `/crm`. No se aceptan destinos
de redirección enviados por query o formulario. Toda ruta que use las guardas de
Clerk debe figurar en el matcher, incluido `/mis-carreras`; `/cuenta` solo se añade
si finalmente lee identidad en servidor, pues hoy no está cubierta por el matcher.

## Requisitos

### Identidad, carreras y beneficios reales

1. Todas las lecturas y acciones privadas requieren la cuenta de Clerk y su correo
   primario verificado. El servidor obtiene propietario y actor; ignora los ids
   de cuenta, roles, importes, saldos y estados enviados por el cliente.
2. Cada reserva, movimiento, referido y canje se consulta con el `userId` propio.
   Manipular un id ajeno no revela su existencia ni información de otra cuenta.
3. El hub reutiliza las lecturas públicas de bookings; no importa sus internals.
   El perfil no concede acceso al CRM ni crea asignaciones en `staff_*`.
4. Los beneficios de una reserva deben tener una asignación o snapshot explícito
   de lo contratado. La reserva actual no guarda la versión de oferta ni su bono:
   no se le atribuye retrospectivamente el bono de la oferta activa del catálogo.
   Los beneficios antiguos sin evidencia se muestran como no registrados, no como
   adquiridos ni como ventajas automáticamente canjeables. El CRM permite asignar
   esas ventajas con evidencia/condiciones y auditoría, sin alterar lo contratado
   ni conceder puntos por introducir una nota.
5. Las condiciones del paquete y las recompensas de fidelidad se distinguen. Un
   `bonusDescription` no monetario de una oferta no se convierte en descuento.

### Referidos

6. Cada cuenta verificada puede obtener un código opaco, aleatorio y no secuencial,
   sin correo ni `userId` codificados, con enlace del origen permitido del sitio.
   Compartir usa copiar/Web Share o un enlace elegido por el usuario; no envía
   mensajes ni carga agendas, correos o teléfonos de terceros en el servidor.
7. Un enlace público no crea una cuenta, una reserva, una atribución ni estrellas.
   El referido confirma el código con su propia sesión verificada y acepta los
   términos de la atribución antes de vincularse. Esa aceptación no equivale a
   consentimiento para marketing ni se deduce del formulario de leads.
8. Propuesta MVP: permitir introducir el código en Referidos después del acceso.
   El enlace `/r/[code]` explica cómo usarlo y lleva a un destino cerrado del sitio.
   La persistencia automática entre el enlace y el login solo se implementará si
   se define su transporte, caducidad y pruebas; no se confiará en parámetros o
   cookies del cliente como evidencia de elegibilidad económica.
9. Una cuenta referida solo puede tener una atribución válida. Se rechazan
   autorreferidos, códigos inválidos/inactivos y reasignaciones desde el cliente.
   Reintentos y solicitudes simultáneas devuelven el mismo resultado, no duplican
   vínculos. Los casos previos de reservas/cuentas requieren una regla explícita
   de elegibilidad antes de activar el programa.
10. Quien refiere ve estados y cantidades mínimas de su actividad, sin datos de
    contacto, identidad completa, pagos o reservas del referido. La verificación
    y corrección administrativa se auditan y no dependen de metadatos de Clerk.

### Estrellas y reglas

11. **Decisión confirmada por el usuario:** las estrellas se acreditan cuando el
    referido tiene una reserva confirmada y realiza su primer pago positivo,
    registrado y no anulado. Ambas condiciones deben cumplirse, cualquiera que
    sea su orden. Crear una cuenta, hacer clic o enviar un lead no acredita.
12. **Decisión confirmada por el usuario:** administración configura en el CRM
    los premios, las estrellas necesarias y los descuentos. Las reglas se
    versionan: estrellas por referido elegible, fechas de inicio/fin, elegibilidad,
    topes, coste del canje, vigencia y condiciones. La configuración respeta el
    hito de reserva confirmada y primer pago elegido por el usuario.
    Sin una regla y un premio válidos activados, no se anuncian ganancias o canjes.
13. Una regla activada no se reescribe para alterar lo ya ganado o emitido. La
    atribución/canje conserva la versión aplicable y las condiciones visibles.
    Debe decidirse si la regla de devengo se fija al aceptar el código o al
    cumplirse el hito; la recomendación es fijarla al aceptar para dar certeza.
14. Los movimientos forman un ledger inmutable: crédito, reserva para canje,
    consumo, liberación, vencimiento si procede y reversión referenciada. Cada
    evento tiene una clave única derivada de su causa y regla, no de la hora del
    reintento. No se borran o editan movimientos para corregir un saldo.
15. El saldo disponible no es dinero ni se multiplica por una equivalencia
    implícita. Se deriva del ledger o de una proyección mantenida junto a él en
    la misma operación atómica, comprobada mediante conciliación.
16. La acreditación consulta reservas y pagos reales. Debe reaccionar tanto a la
    confirmación como al registro/anulación del pago o cancelación de la reserva,
    independientemente del orden en que ocurran. Una cuenta repetida o dos reservas
    no generan más premios de los que permita la versión elegida.
17. Los servicios de registro/anulación de pagos del runner-portal F3/PR #19 aún
    no están en la base inspeccionada. Con el hito de primer pago confirmado,
    esa operación y su reconciliación son un prerrequisito real; no basta con aprobar
    una reserva o simular un evento de n8n para afirmar que se ganó el premio.
18. Anular un hecho que originó estrellas produce una reversión idempotente. La
    política para premios ya consumidos necesita decisión: no se crea deuda
    monetaria ni se altera una reserva pagada de forma automática. Mientras se
    resuelve una inconsistencia se bloquea el canje afectado y se audita la revisión.

### Canjes, descuentos y administración

19. El catálogo define coste entero en estrellas, tipo de beneficio, condiciones,
    vigencia, disponibilidad y versión. Propuesta MVP: descuento fijo en USD
    enteros, coherente con el modelo actual, o beneficio no monetario explícito.
    No se añade porcentaje, otra moneda ni una equivalencia estrella/dinero sin
    definición. Monto, tope y acumulación con otras promociones están pendientes.
20. Pedir el mismo canje dos veces devuelve el mismo canje. Dos solicitudes
    concurrentes diferentes no pueden gastar las mismas estrellas ni superar las
    unidades de un premio. Validar saldo en JS y luego insertar no es suficiente:
    se exige una operación atómica con actualización condicional/bloqueo apropiado,
    ledger y emisión juntos, o rollback completo ante cualquier fallo.
21. Una recompensa emitida pertenece a una cuenta y tiene estados auditables:
    disponible, reservada, aplicada, vencida o anulada. Reservas abandonadas o
    vencidas liberan estrellas una sola vez según la regla publicada.
22. El CRM aplica un descuento solo a una reserva ya vinculada al mismo `userId`,
    pendiente y sin pagos. Comprueba todo de nuevo en servidor. Guarda el total
    base, descuento, total final, canje, regla, actor y fecha; consume el canje en
    la misma operación. La edición posterior no puede eludir esos ajustes.
23. No se reescribe una versión aprobada de `trip_offers`, ni se recalculan reservas
    ya pagadas a partir de precios actuales. Descuento nunca supera el total ni
    produce saldo final negativo. El límite concreto y los canjes que agoten el
    total requieren la política de negocio, no un redondeo o límite inventado.
24. Propuesta de permisos explícitos: `rewards.manage` para admin/super admin;
    `rewards.apply` para quien ya tiene `bookings.manage`, con controles de dueño
    y elegibilidad. Commercial no publica reglas ni edita saldos, y organizer o
    sponsor no ganan permisos nuevos. Ajustes excepcionales requieren motivo y
    un movimiento de auditoría; nunca un formulario de "saldo libre". Registrar
    beneficios contractuales y sus condiciones requiere `rewards.manage`.

## Modelo y contratos propuestos

Módulo nuevo `modules/rewards`, con API pública y servicios server-only. Nombres
lógicos de tablas: `referral_codes`, `runner_referrals`, `reward_rule_versions`,
`reward_accounts`, `reward_ledger`, `reward_catalog_versions`, `reward_redemptions`
y `booking_benefits`. La implementación debe minimizar/simplificar ese modelo sin
perder unicidad, referencias de causa, snapshots, propiedad y reversión.

Las cuentas del runner guardan ids estables de Clerk sin FK hacia esquemas del
proveedor ni obligación de existir como staff. Las referencias a reservas/reglas/
canjes son FK de `public`; los saldos y costes usan enteros con restricciones y
unicidad. Las migraciones se generan sobre el último snapshot, se revisan y prueban
localmente, y se aplican a mano con autorización; no se fija de antemano un número.

Contratos de servidor, con nombres definitivos a validar al implementar:
`getRunnerHub`, `getOwnRewards`, `getOwnReferrals`, `claimReferral`,
`reconcileReferralEligibility`, `requestRedemption` y `applyRewardToBooking`.
Las lecturas privadas y sus errores devuelven datos mínimos y mensajes fijos sin
causas SQL, parámetros personales ni secretos. No se crea una API pública de saldos.

## Criterios de aceptación y pruebas

- [ ] El hub muestra únicamente carreras del usuario y estados reales; nunca
  convierte una consulta de contacto en inscripción ni enseña una reserva ajena.
- [ ] `/mis-carreras` reutiliza el portal aprobado, con Clerk y matcher completo.
  La navegación a perfil, carreras, beneficios y referidos funciona con teclado.
- [ ] Cuenta sin verificar no lee perfil, carreras, saldos o referidos; una cuenta
  de staff conserva sus permisos y ve solo su actividad personal en el hub.
- [ ] Una reserva antigua no hereda el bono de una oferta nueva; cada beneficio
  adquirido muestra su origen y condiciones registradas, o su ausencia real.
- [ ] Clic, lead, autorreferido, código inválido y segunda atribución no acreditan.
  Dos aceptaciones concurrentes crean una sola relación; no exponen datos ajenos.
- [ ] Una reserva confirmada y su primer pago válido acreditan exactamente una vez,
  aun con eventos repetidos o en distinto orden. Cada condición por separado no
  acredita. Reversión y anulación no duplican movimientos ni alteran pagos.
- [ ] Administración configura premios, estrellas necesarias y descuentos desde
  el CRM con sus permisos y versiones; no se fijan importes o equivalencias ficticios.
- [ ] Sin reglas completas activas no se prometen estrellas ni descuentos. Cambiar
  reglas no modifica el historial ni las condiciones de premios ya emitidos.
- [ ] Un saldo insuficiente o premio vencido no se canjea. Reintentos y doble gasto
  se prueban contra PostgreSQL con dos sesiones, además de tests de servicios.
- [ ] Canjear un premio y aplicar un descuento son operaciones auditadas: fallo
  intermedio no consume estrellas; dueño ajeno, reserva pagada o modificación del
  importe del cliente se rechazan antes de cambiar datos.
- [ ] Pasan pruebas de reglas/schemas/services/acciones/componentes con conducta,
  lint y tipos; se ejecutan build Next/Worker y controles funcionales autenticados.
  Los bloqueos actuales de Google Fonts y credenciales no se cuentan como éxito.

## Plan de tareas

Las fases son secuenciales. Cada una tiene hasta cinco tareas y aproximadamente
quince archivos; sus migraciones/snapshots cuentan dentro de su entrega. Los
archivos compartidos se editan en secuencia y los builds no se paralelizan.

### F1 — Base segura del portal existente
- [x] T1 — Adaptar selectivamente las utilidades y pruebas del PR #33; `modules/bookings/utils/runnerPortal.ts` y `.test.ts`; no importar sus refactors ajenos.
- [x] T2 — Conservar Clerk y añadir solo nombre de presentación opcional si se reutiliza; `lib/auth/guards.ts` y `.test.ts`. Un nombre ausente no invalida la sesión.
- [x] T3 — Cobertura de `/mis-carreras` y perfil; `middleware.ts` y `.test.ts`; preparar exports de `SignOutButton` y utilidades públicas de landing en ambos `index.ts`.

### F2 — Mis carreras: página y detalle
- [x] T1 — Reutilizar los seis componentes del portal: `RunnerPortal`, `PortalHeader`, `RaceSelector`, `BookingOverview`, `TripTimeline` y `TripUpdates`; adaptar `BookingStatusBadge` al export existente, sin duplicarlo.
- [x] T2 — Reutilizar `components/ui/empty.tsx` del trabajo existente si falta; no sobrescribir `alert.tsx`.
- [x] T3 — Exportar y componer la ruta; `modules/bookings/index.ts`, `app/mis-carreras/page.tsx`.
- [x] T4 — Verificar estados y aislamiento con las pruebas del portal; añadir pruebas de componentes con comportamiento y controles funcionales sin datos de producción.

### F3 — Hub privado y navegación de Mi cuenta
- [x] T1 — Resumen de carreras mediante la API pública de bookings; `modules/accounts/utils/runnerHub.ts` y `.test.ts`, `components/RunnerHubSummary.tsx` y `.test.tsx`.
- [x] T2 — Composición con el editor existente; `app/cuenta/perfil/page.tsx`, `RunnerProfilePanel.tsx`, `modules/accounts/index.ts`. Las secciones de recompensas se habilitan solo cuando estén implementadas.
- [x] T3 — Destino cerrado del runner y accesos; `RunnerAccount.tsx` y su test, `AccessPanel.tsx` y su test, `types/auth.types.ts`; staff conserva `/crm`.
- [x] T4 — Documentar el hub y conservar estados de carga/error/privacidad; `README.md` y pruebas relevantes.

### F4 — Reglas, catálogo y datos de fidelidad
- [x] T1 — Schema incremental y migración local; `lib/db-schema.ts`, SQL, snapshot y journal nuevos.
- [x] T2 — Permisos y tests; `lib/auth/permissions.ts`, `lib/auth/permissions.test.ts`.
- [x] T3 — Schemas/tipos y validación de versiones; `modules/rewards/schemas/rewards.schema.*`, `types/rewards.types.ts`.
- [x] T4 — Service de configuración/catálogo y tests; `modules/rewards/services/program.service.*`.
- [x] T5 — Acción con pruebas, formulario/página administrativos y exports; `modules/rewards/actions/program.actions.*`, `components/ProgramForm.tsx`, `app/crm/(protected)/recompensas/page.tsx`, `modules/rewards/index.ts`. No activar con condiciones pendientes.

### F5 — Referidos y atribución
- [x] T1 — Código opaco y atribución única; `modules/rewards/services/referrals.service.*`, `schemas/referrals.schema.*`.
- [x] T2 — Acción y pruebas de aceptación por cuenta verificada; `modules/rewards/actions/referrals.actions.*`.
- [x] T3 — Panel y enlace público; `components/ReferralsPanel.tsx` y sus pruebas de comportamiento, `app/r/[code]/page.tsx`.
- [x] T4 — Exports, integración del hub e instrucciones; `modules/rewards/index.ts`, `modules/accounts/components/RunnerProfilePanel.tsx`, `README.md`.

### F6 — Ledger, acreditación y reversión
- [x] T1 — Movimientos, saldo y proyección conciliable; `modules/rewards/services/ledger.service.*`.
- [x] T2 — Elegibilidad y reconciliación idempotente; `modules/rewards/utils/eligibility.*`, `services/eligibility.service.*`.
- [x] T3 — Conectar confirmación/pagos con la API pública de rewards; services afectados de bookings y sus pruebas, una vez integrado el registro/anulación de pagos requerido por el hito confirmado.
- [x] T4 — Historial y estados del hub; `components/RewardsHistory.tsx` con pruebas, `modules/rewards/index.ts`, `RunnerProfilePanel.tsx`.
- [x] T5 — Comprobar causas únicas, reintentos, orden de eventos y reversión, sin conceder puntos por eventos no verificados.

### F7 — Beneficios contractuales y canjes
- [x] T1 — Asignación auditada de beneficios con origen/condiciones y lectura propia; `modules/rewards/services/benefits.service.*`, `schemas/benefits.schema.*`.
- [x] T2 — Acción de asignación con tests y formulario en la ficha de reserva; `actions/benefits.actions.*`, `components/BookingBenefitsForm.tsx`, `app/crm/(protected)/reservas/[id]/page.tsx`.
- [x] T3 — Reserva/consumo/liberación de canjes y validación; `services/redemptions.service.*`, `schemas/redemptions.schema.*`.
- [x] T4 — Acción de canje con pruebas, UI e integración; `actions/redemptions.actions.*`, `components/BenefitsPanel.tsx` y exports del módulo. Dividir esta entrega antes de ejecutarla si supera aproximadamente quince archivos.
- [x] T5 — Prueba PostgreSQL concurrente de idempotencia/doble gasto; arnés local y guía, sin usar Neon de producción.

### F8 — Descuentos en reservas y cierre
- [x] T1 — Aplicación del canje con snapshot de precio y tests; `services/bookingRewards.service.*`, `schemas/bookingRewards.schema.*`.
- [x] T2 — Acción administrativa y UI de reserva; `actions/bookingRewards.actions.*`, `components/ApplyRewardForm.tsx`, `app/crm/(protected)/reservas/[id]/page.tsx`.
- [x] T3 — Proteger edición/estado/pagos tras ajuste; `modules/bookings/services/bookings.service.*` y service de pagos integrado con su test, usando exports públicos de rewards.
- [x] T4 — Exports, README y condiciones visibles coherentes; `modules/rewards/index.ts`, `README.md`, `modules/landing/components/AccountSection.tsx` y `CommunitySection.tsx`.
- [ ] T5 — Revisión independiente, suite conjunta, pruebas autenticadas y build/Worker; registrar resultados, migraciones pendientes y remediaciones previas.

## Decisiones confirmadas por el usuario

- Acreditación: cuando el referido confirme una reserva y haga su primer pago.
- Configuración: reglas de premios, estrellas necesarias y descuentos administradas
  desde el CRM.

Estas respuestas resuelven las dos preguntas de negocio planteadas; no fijan una
cantidad de estrellas, un importe de descuento ni un premio activo por defecto.

## Condiciones pendientes antes de activar el programa

1. Configurar en el CRM las cantidades, coste de cada premio, monto/tope del
   descuento, vigencia y combinación con ofertas antes de publicar la regla.
2. Elegibilidad de cuentas o reservas anteriores y si hay máximo por referido,
   campaña o periodo; propuesta inicial: una atribución por cuenta, sin retroactividad.
3. Qué ocurre al anular el pago/cancelar cuando un premio ya se consumió y qué
   beneficios contractuales reales deben asignarse a las reservas existentes.
4. Confirmar destino de login al hub y que `/mis-carreras` conserve el detalle.

Esta spec permanece en borrador hasta la aprobación humana de su versión vigente.
Ningún saldo, descuento o mecanismo descrito se considera implementado por redactarla.


## Registro de ejecución — 29/10/2026

El usuario ordenó «implementar y ejecutar» en esta conversación después de estos
borradores. Se implementó ese alcance; el estado documental permanece borrador
y no se alteró approvals.jsonl ni se fabricaron firmas de Claude. La instrucción
real de la sesión se conserva en el informe de implementación.

Las responsabilidades pequeñas de recompensas se consolidaron en
`modules/rewards/services/rewards.service.ts`, `schemas/rewards.schema.ts`,
`actions/rewards.actions.ts` y sus pruebas, con funciones transaccionales en 0012.
Los esquemas están en `lib/rewards-schema.ts` y `lib/content-schema.ts`,
reexportados desde db-schema. Se reutilizó selectivamente UI del PR #33 y registro
de pagos del PR #19, actualizando Clerk e idempotencia sin fusionar sus ramas.
Las tareas marcadas indican implementación local; no implican despliegue ni
validación autenticada. La tarea final conserva pendientes las comprobaciones
con Clerk/Neon y el Worker, bloqueadas por credenciales/red.

Evidencia y mapa operativo: [auditoría de ampliación](../audits/2026-10-29-runner-news.md)
y [operación](../OPERACION-RUNNER-NOTICIAS.md).
