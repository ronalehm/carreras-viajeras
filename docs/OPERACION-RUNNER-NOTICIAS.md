# Operación de Mi cuenta, recompensas y noticias

Implementación autorizada en esta conversación por «implementar y ejecutar»,
después de las dos propuestas del 29/10/2026 y las decisiones de reserva confirmada
más primer pago y reglas administrables en CRM. Los documentos de diseño se
conservan como borradores; no se fabricó una aprobación HMAC de Claude ni se editó
su registro. La implementación no activa condiciones económicas ni publica contenido.

## Preparar una instancia de desarrollo

Se conservan Node 24, npm ci, Clerk y Neon HTTP/Drizzle. Configura en ajustes seguros
las variables DATABASE_URL (Neon de desarrollo con TLS), CLERK_SECRET_KEY y
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY de la misma instancia de desarrollo, y APP_ORIGIN.
Comprueba presencia sin imprimir valores. No reemplaces archivos privados existentes.

Sobre una rama de desarrollo de Neon, revisa primero el estado real del esquema y
su historial de migraciones. Las anteriores 0000–0010 permanecen intactas.
Aplica **una sola vez**, en orden y mediante operación manual autorizada:

1. `drizzle/0011_runner_rewards_content.sql`, completa en una transacción.
2. `drizzle/0012_reward_operations.sql`, completa en otra transacción.

0011 añade ocho tablas de recompensas, dos de contenido y la clave de idempotencia
opcional de los pagos históricos. Los pagos nuevos siempre requieren una UUID;
no se inventan claves para los anteriores. 0012 añade funciones y triggers
transaccionales. Su ejecución exige permisos para crear funciones PL/pgSQL y triggers
en public; son SECURITY INVOKER, sin privilegios elevados ni SQL dinámico.
No se aplican automáticamente y esta entrega **no ejecutó SQL remoto**.

Comprueba después `npm run dev` y `/api/health`, y realiza los flujos de abajo con
usuarios de desarrollo. El health público es liveness; no verifica Clerk ni Neon.
Para Workers utiliza únicamente `npm run build:worker` y `npm run preview`, que
conservan la limpieza de secretos. Las fuentes de Google necesitan acceso HTTPS.

## Configurar y usar el programa

- Admin y super admin gestionan reglas/premios en `/crm/recompensas`; commercial
  puede aplicar canjes/registrar entregas desde la reserva, sin modificar reglas.
  Organizer y sponsor no reciben permisos de recompensas ni contenido.
- Cada nueva regla y versión de premio conserva condiciones, vigencia en Lima,
  actor y versión. Para ofrecer el programa se necesitan regla **y** premio vigentes.
  No se proporciona una equivalencia económica predeterminada ni saldo de demo.
- Define estrellas por referido, límite si corresponde, condiciones, coste de cada
  premio, descuento en USD enteros o beneficio no monetario, inventario opcional,
  máximo por runner y días de vigencia del canje. El stock y el máximo por runner
  se cuentan entre versiones del mismo premio; no se reinician cambiando su versión.
- Comparte el enlace opaco desde Mi cuenta. `/r/[code]` solo explica la invitación;
  no atribuye por clic ni usa cookies para ello. El referido inicia sesión, verifica
  el correo primario, introduce el código y acepta la versión mostrada. Si la regla
  cambió mientras completaba el formulario, se solicita recargar y volver a revisarla.
- Una cuenta admite una atribución, sin autorreferido ni atribución retroactiva tras
  tener reserva vinculada. La regla aceptada queda fijada y visible. Los referidores
  ven cantidades agregadas, sin nombres, correos ni pagos de sus referidos.
- El equipo registra pagos y sus anulaciones en la reserva. La confirmación y un
  pago positivo no anulado acreditan una sola vez; el orden de esos dos eventos no
  importa. El registro manual no implica procesamiento bancario o pasarela de pago.
- Un canje reserva estrellas; puede cancelarse o vencer y liberar esas estrellas
  una sola vez. Un canje vencido deja de consumir stock aunque su titular no vuelva.
  La devolución de estrellas se concilia al consultar/operar su cuenta.
- Un descuento requiere reserva de la misma cuenta, pendiente y sin pagos vigentes.
  No se acumula con otro descuento, debe ser menor que el total y guarda precio
  original, descuento y total final. Ese total queda protegido contra edición posterior.
  Un beneficio contractual exige evidencia/condiciones explícitas y un administrador;
  no se hereda automáticamente el bono de una oferta posterior.
- Anular pagos/cancelar reservas puede revertir estrellas. Un saldo negativo es un
  ajuste de puntos pendiente, nunca deuda monetaria. Bloquea nuevos canjes y su
  aplicación; los descuentos ya aplicados no reescriben lo contratado.
- La conciliación ocurre después del commit financiero y también al consultar o
  canjear. Si falla después del commit, el pago continúa registrado, se emite un
  mensaje de log fijo y la siguiente consulta reintenta la conciliación sin duplicar
  pagos o puntos. No hay un job programado de conciliación en esta entrega.

## Publicar noticias

Admin y super admin usan `/crm/contenidos`. Cada guardado crea una revisión; el
control de versión rechaza una edición obsoleta. Publicar es explícito. Editar
una publicación no cambia lo que ve el público hasta publicarla de nuevo.
Despublicar y archivar retiran el acceso público en la siguiente petición; un slug
publicado queda fijo. Las categorías son noticias, actualizaciones y artículos.
El cuerpo es texto escapado; una imagen HTTPS requiere texto alternativo.

La portada muestra hasta tres publicaciones. `/noticias` permite paginación y filtro
por categoría. Los avisos privados del itinerario permanecen privados. No se
publicó contenido real ni se crearon noticias de muestra.

## Pruebas reproducibles

Desde la raíz:

```sh
npm run lint
npm test -- --run --maxWorkers=3
./node_modules/.bin/next typegen
./node_modules/.bin/tsc --noEmit
npm run build:worker
```

La prueba nativa usa solo Node y Docker; no lee DATABASE_URL ni credenciales.
Arranca PostgreSQL desechable sin red ni puerto expuesto:

```sh
docker run -d --name carreras-rewards-tests --network none \
  --label codex.task=carreras-runner-news \
  --tmpfs /var/lib/postgresql \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:18-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5
docker exec carreras-rewards-tests pg_isready -U postgres
node scripts/check-feature-database.mjs
docker rm -f carreras-rewards-tests
```

Espera readiness antes del script. Este comprueba la etiqueta, crea una base con
nombre propio, aplica las migraciones, ejecuta 45 aserciones SQL y seis carreras
con dos sesiones; observa el bloqueo real en pg_stat_activity antes de liberar
la primera transacción. Elimina su base al terminar. No apunta a una base remota.
Los saldos/datos sintéticos existen solo en esa base. CI añade un job independiente
para el mismo control; su ejecución en GitHub no se presume por validar localmente.

Antes de producción quedan pruebas autenticadas de propietario/otra cuenta/roles,
flujo pago→estrella→canje→descuento, reversión, noticias y navegación móvil real,
además del build y preview soportados del Worker. Consulta la auditoría para sus
resultados y las remediaciones heredadas; una prueba bloqueada no se considera pasada.
