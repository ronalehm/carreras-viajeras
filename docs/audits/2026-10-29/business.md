# Auditoría de negocio, consistencia y automatización

Fecha: 29 de octubre de 2026. Revisión de solo lectura del árbol de integración del
PR #22 en `/workspace/carreras-viajeras`, comparado con `origin/main` 4863229.

## Resultado

Se encontró un defecto nuevo del PR #22 en la invalidación de las fichas de usuario,
comunicado al agente principal y corregido durante la auditoría. Queda un hallazgo
P2 preexistente en la concurrencia de activación de ofertas. No se identificaron
defectos nuevos de autorización o integridad de negocio en los módulos CRM,
integraciones, viajes u operaciones de reservas examinados.

## Hallazgo pendiente

### P2 — Una activación fallida puede cerrar la oferta anterior sin dejar sucesora activa

**Origen:** preexistente; `modules/trips/services/offers.service.ts` no tiene cambios
frente a `origin/main`.

**Ubicación:** `modules/trips/services/offers.service.ts:355`–`:375`, con la operación
concurrente de `closeOffer` en `:400`–`:405`. Restricciones relevantes en
`lib/db-schema.ts:463`–`:483`.

`activateOffer` realiza tres sentencias dentro de `db.batch`: primero cierra la
versión activa, después intenta activar la candidata y por último explica el
resultado. El `EXISTS` de la primera sentencia comprueba que la candidata está
aprobada, pero no bloquea esa candidata. La segunda vuelve a comprobar su estado.
Si ya no está aprobada, devuelve cero filas y la función responde
`invalid_transition`; no provoca un rollback de lo que la primera sentencia cambió.

Intercalado reproducible con dos sesiones y aislamiento Read Committed:

1. Existe una oferta general v1 activa y v2 aprobada, ambas vigentes, del mismo
   viaje no archivado. Ambas operaciones pertenecen a administradores autorizados.
2. Sesión A comienza la activación de v2. Su primera sentencia cierra v1 y le pone
   `superseded_by = v2`, porque el `EXISTS` lee v2 como aprobada.
3. Antes de la segunda sentencia de A, sesión B ejecuta `closeOffer(v2)` y confirma.
   Esa operación solo modifica estado y auditoría de v2.
4. La segunda sentencia de A ya ve v2 cerrada y afecta cero filas. Su SELECT ve
   ese estado y devuelve `invalid_transition`, pero el batch puede confirmar.
5. v1 y v2 quedan cerradas. El viaje pierde la oferta anterior aunque la activación
   solicitada no ocurrió; la lectura pública deja de mostrar precio aplicable.

El bloqueo de la fila v1 no impide modificar v2. La FK `superseded_by` conserva la
existencia de v2, pero su bloqueo KEY SHARE no impide una actualización no clave
de `status`/auditoría. El CHECK de cierre no exige que la sucesora quede activa y
el índice parcial de activas solo impone *a lo sumo una*, por lo que el estado sin
ninguna activa no produce un error que revierta el batch.

El driver `NeonHttpSession.batch` (`node_modules/drizzle-orm/neon-http/session.js`,
aproximadamente 116–132) invoca la transacción sin fijar `isolationLevel`; `getDb`
tampoco lo especifica. El escenario se refiere al aislamiento Read Committed
predeterminado de PostgreSQL. Una configuración externa más estricta podría
convertir esta carrera en un error de serialización, pero el repositorio no la
establece ni verifica.

**Corrección recomendada:** preservar la elegibilidad de la candidata durante el
intercambio mediante bloqueo/transacción apropiada o un aislamiento que revierta
la activación concurrentemente invalidada. Asegurar que, si la activación afecta
cero filas después de cerrar una activa, la transacción no confirma ese cierre.
Añadir una prueba de integración con dos sesiones; comparar dos expresiones SQL
idénticas no demuestra que sus condiciones se mantengan entre sentencias.

**Evidencia y límite:** el intercalado se deduce de las sentencias, los locks y las
restricciones reales. No se ejecutó una prueba concurrente contra Neon ni un
PostgreSQL de varias sesiones en esta revisión. PGlite es una validación local de
schema y restricciones, no una demostración de esta concurrencia. Las pruebas
actuales de `activateOffer` (aproximadamente `offers.service.test.ts:462`–`:518`)
simulan respuestas y no cubren este caso. Se recomienda confirmar la reproducción
de dos sesiones antes de declarar el hallazgo corregido.

## Hallazgo corregido durante la auditoría

### P2 — Patrón de invalidación de fichas sin el grupo de ruta real

**Origen:** incorporado por el PR #22.

`modules/accounts/actions/staff.actions.ts:24` usaba
`/crm/admin/usuarios/[id]` como patrón para `revalidatePath(..., "page")`, mientras
el archivo real pertenece a `/crm/(protected)/admin/usuarios/[id]`. Las llamadas
con patrón invalidan la estructura de archivos, incluidos los route groups. Las
expectativas antiguas del mock repetían la cadena incorrecta.

Se verificó con la documentación instalada de Next:
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`,
secciones de parámetros y ejemplos con route groups, aproximadamente 28, 84 y
149–151. El módulo de reservas ya utiliza correctamente el grupo `(protected)`.

El agente principal cambió la constante a
`/crm/(protected)/admin/usuarios/[id]` y las expectativas exactas de los tests. La
corrección está presente en el árbol al terminar esta revisión. Los resultados
del reintento de tests deben tomarse del registro de validación del agente principal.

## Cobertura de la revisión

Se revisaron los contratos y límites de los cuatro dominios, que contienen 78
archivos fuente: CRM (38), integraciones (8), viajes/ofertas (21) y reservas (11),
además de las rutas n8n y las páginas públicas de carreras/registro relacionadas.
Se inspeccionaron especialmente los services y acciones con acceso a datos, schemas,
tipos, utilidades de fechas/importes, formularios y las pruebas que documentan sus
garantías. La revisión se complementa con la auditoría independiente de seguridad,
la validación de migraciones y las pruebas ejecutadas por el agente principal.

Se contrastaron `crm-journey-automation`, `landing-omnichannel-capture`,
`trips-commercial-offers`, el alcance actual de `runner-portal` y las decisiones de
Clerk/RBAC. Entre los controles observados:

- La vía de entrada del lead es inmutable y su canal comercial puede corregirse;
  los cambios de canal/etapa/propietario usan sentencias atómicas con historial.
- El actor se obtiene de la sesión y las acciones verifican permisos antes de
  validar y mutar; el organizador queda limitado al alcance de sus viajes.
- Captura web conserva consentimiento, gate legal, Turnstile en servidor,
  límites de tamaño, honeypot, idempotencia y payload mínimo del outbox.
- La deduplicación bajo claves distintas y simultáneas tiene las limitaciones
  expresamente aceptadas en las specs; no se presentó esa decisión como defecto nuevo.
- La API n8n comprueba Bearer antes de acceder a datos, limita el cuerpo y usa
  errores fijos, UUID y lease tokens. `originDetail` está autorizado para n8n por
  la spec posterior, aunque su envío a Gemini sigue excluido por contrato.
- Claims del outbox usan leases de cinco minutos, SKIP LOCKED y límite de ocho
  intentos; ack/fail requieren el token vigente. Los recordatorios usan dedupe por
  episodio y excluyen archivados, bajas y etapas fuera de venta.
- Reservas usan índices únicos parciales para participante/viaje y lead activo;
  las confirmaciones vinculadas avanzan el lead y emiten historial/evento en una
  misma sentencia. La lectura del runner filtra cada consulta por su id estable,
  pagos no anulados e hitos visibles.
- Las ofertas públicas exponen columnas explícitas, resuelven la campaña en el
  servidor y usan importes enteros y conversión exacta. El precio antiguo del
  catálogo no vuelve a la web ni a las escrituras del formulario.

No se ejecutaron builds, servicios, escrituras de aplicación ni pruebas nuevas en
el checkout por parte de este reviewer. La auditoría estática no acredita sesiones
reales de Clerk/Neon, ejecución de los workflows externos de n8n, pagos o fases
todavía pendientes del portal del runner.
