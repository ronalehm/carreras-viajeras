# Auditoría de Mi cuenta, recompensas, pagos y noticias

Fecha: 29/10/2026 UTC. Base local `ff9ca9682ba4110f66d7b4abb7f6bd6303fc778b`,
continuación del PR #22 y de la [auditoría general del repositorio](2026-10-29.md).
Se revisaron todos los cambios de esta ampliación y su interacción con Clerk,
roles, reservas/pagos, ofertas, landing, migraciones y configuración de CI/Codex.

## Resultado y alcance real

Se implementaron el hub del runner, su portal de carreras, beneficios con evidencia,
referidos consentidos, estrellas, premios/canjes/descuentos configurables y noticias
públicas con gestión editorial. Se integró selectivamente la UI del PR #33 y el
registro/anulación de pagos del PR #19; no se fusionaron esas ramas completas.
Clerk y los contratos vigentes se conservaron. El PR #23 sigue conciliado como
propuesta sustituida por source inmutable y channel editable.

La orden humana «implementar y ejecutar» posterior a los borradores autoriza esta
implementación en la sesión. No se cambió Estado a aprobado ni se fabricaron firmas
de Claude. Los documentos conservan el estado de borrador y un registro de ejecución.
No se activaron reglas o premios económicos, no se publicaron noticias reales,
no se aplicaron migraciones remotas y no se desplegó Cloudflare.

No se identificaron defectos nuevos críticos/altos sustentados en esta revisión.
Se corrigieron los siguientes defectos antes del cierre:

| Hallazgo | Corrección y evidencia |
| --- | --- |
| Términos cambiados durante la aceptación | La aceptación transporta el id de la regla mostrada; la transacción rechaza otra versión. Conserva y muestra las condiciones aceptadas. Pruebas de acciones, UI y PostgreSQL. |
| Canje vencido ajeno ocupa inventario | El conteo considera aplicados y disponibles aún vigentes; excluye vencidos sin adquirir locks de cuentas ajenas. SQL nativo verifica ese caso. |
| Reintentos y segunda intención de pago/canje | UUID estable por intención y claves únicas. Payload diferente con la misma clave falla. Tras éxito, otro registro/canje requiere acción explícita y UUID nueva. Pruebas de formulario, acciones y sesiones concurrentes. |
| Doble gasto / última unidad de stock | Locks de cuenta y catálogo y ledger dentro de una transacción. Se observa la espera real de la segunda sesión antes de liberar la primera. |
| Precio editado tras descuento concurrente | Trigger de PostgreSQL con constraint identificada; service devuelve discount_locked y el formulario muestra el total de solo lectura. No cambia retrospectivamente ofertas o precios contratados. |
| Error PL/pgSQL por nombre balance ambiguo | UPDATE usa reward_accounts.balance. Canje real ejecutado en PostgreSQL, sin depender solo de SQL mockeado. |
| Programa parcialmente configurado | Nuevas atribuciones/canjes requieren regla y premio vigentes. La cuenta no anuncia condiciones activas si falta una mitad. No se siembran cantidades económicas. |
| Publicidad de estrellas por acciones no implementadas | La landing explica referidos, reserva confirmada y primer pago válido; remite a las condiciones reales de Mi cuenta. |

La revisión independiente fue de solo lectura; el agente principal aplicó las
integraciones y ejecutó los checks globales. Los controles heredados y las alertas
no se ocultan bajo esta revisión de la ampliación.

## Validación

| Control | Resultado |
| --- | --- |
| Suite final | **99 archivos, 2.589 pruebas correctas**, sin fallos ni omitidas. Incluye guardas Clerk reales con proveedor/BD simulados, aislamiento, actores falsificados, UI y validación. |
| ESLint y TypeScript | Correctos. Next typegen generó las rutas nuevas. |
| Consistencia Drizzle | 26 tablas; db:generate informa que no hay cambios de schema pendientes. |
| Migraciones nativas | 0000–0012 aplicadas sobre PostgreSQL **18.6**, en base nueva desechable. 0010, 0011 y 0012 completas en transacciones independientes. |
| Recompensas SQL | **45 aserciones** secuenciales sobre consentimiento, versiones, ausencia de programa, elegibilidad en ambos órdenes, snapshots, ownership, reversión, reintentos, descuento, stock, vencimiento e inmutabilidad. |
| Concurrencia PostgreSQL | **14 comprobaciones del arnés**, incluidas seis carreras con dos sesiones: misma solicitud, solicitudes distintas con saldo insuficiente, última unidad entre runners, doble cancelación, pago contra descuento y doble conciliación de referido. |
| Contenido SQL | **14 comprobaciones PGlite/PostgreSQL** ejecutando services reales con adaptador local: FK circular, borrador invisible, revisión publicada estable, cambios obsoletos, transición, retirada, slug, alt y aislamiento entre publicaciones. [Resultados](2026-10-29/content-integration.json). |
| Consultas DTO de rewards | Siete consultas reales preparadas y ejecutadas en PostgreSQL: sin ambigüedades de nombres ni errores SQL. |
| Reproducibilidad | El arnés crea/elimina su propia base y verifica la etiqueta del contenedor; no lee DATABASE_URL. Se repitió en contenedor sin red ni puerto expuesto. [Guía](../OPERACION-RUNNER-NOTICIAS.md). |
| Build Worker | **Falló** en el build Next por descarga denegada de Archivo y Plus Jakarta Sans de Google Fonts. El empaquetado, limpieza del artefacto y preview Worker no se consideran validados. |
| Flujos autenticados | **Pendientes**: faltan DATABASE_URL y las dos claves de desarrollo de Clerk. Los unit tests de guardas no acreditan sesiones reales. |
| HTTP local | Servidor integrado arrancado; /api/health respondió200, no-store y status=ok. /, /cuenta/perfil, /api/crm/me y /noticias respondieron500 en el entorno sin claves de Clerk. |
| GitHub Actions | Job PostgreSQL añadido y comandos probados localmente. No se afirma ejecución o resultado en GitHub. |

El arnés reproducible está en `scripts/check-feature-database.mjs` y el fixture
secuencial en `scripts/fixtures/rewards.sql`. Las bases y saldos de prueba son
sintéticos. Los resultados nativos se conservan en
[runner-news-database.json](2026-10-29/runner-news-database.json).

## Riesgos y controles operativos pendientes

Persisten DEP-01/DEP-02 de la auditoría general: Zod 4.6.5 y follow-redirects 1.16.0
con avisos npm altos. El lockfile no cambió en esta ampliación y no se ejecutó
`audit fix --force`. Sigue pendiente el caso preexistente BIZ-01 de activación de
ofertas; no se lo presenta como corregido por los tests concurrentes de recompensas.

Se requieren credenciales de desarrollo introducidas mediante ajustes seguros y
acceso a las fuentes para terminar build/Worker y pruebas autenticadas. No se
inventaron claves ni se deshabilitó TLS. La liveness pública del servidor no
sustituye esa validación. El borrador del entorno conserva estos requisitos.

Las lecturas de wallet muestran hasta 100 canjes/movimientos/beneficios recientes;
el ledger conserva el historial completo. No hay tarea periódica de conciliación:
los cambios financieros la intentan después del commit y las consultas/canjes la
reintentan. Un error posterior no convierte un pago confirmado en un pago fallido.

La activación económica y la primera publicación requieren configuración real por
administración. Antes de producción deben comprobarse dos cuentas y roles separados,
reserva y pago, reversión, canje/descuento/entrega, edición pública, retiro de
noticias, navegación móvil y el Worker con los bindings correctos.
