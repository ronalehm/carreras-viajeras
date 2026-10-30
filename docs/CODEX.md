# Codex en Carreras Viajeras

La configuración del proyecto vive en `.codex/config.toml`, los roles en `.codex/agents/` y las instrucciones comunes en `AGENTS.md`. Se validaron la sintaxis TOML y el esquema oficial de configuración, y Codex CLI 0.163.0 aceptó las claves y rutas mediante overrides explícitos. La carga automática del proyecto debe comprobarse después de que el usuario lo marque como confiable; cada actualización de Codex requiere volver a comprobarla. No se fija un modelo, una credencial ni la política de aprobación del agente principal.

## Uso local y en cloud

Abre Codex en la raíz del repositorio. Las capas de configuración del proyecto solo se cargan cuando la aplicación/CLI considera confiable ese proyecto; revisa esa decisión en los ajustes normales de Codex. No añadas confianza global ni reduzcas el sandbox para hacer que cargue. Si la plataforma administra la configuración, su política prevalece.

En una tarea cloud usa el checkout existente: la tarea ya tiene aislamiento. No crees un Git worktree salvo petición expresa. El script de instalación y las instrucciones de arranque guardados en los ajustes del entorno son independientes de estos archivos: ni una configuración TOML inicia procesos ni un commit publica el entorno.

El agente principal coordina spec, developer y reviewer. La concurrencia del proyecto está limitada a tres hilos de subagentes; las restricciones administradas pueden reducirla. Los modelos se heredan. No se garantiza que una interfaz exponga todas las herramientas de delegación: el agente principal debe comprobar su disponibilidad.

Solo se paralelizan tareas con archivos disjuntos y sin dependencias. Schema, migraciones, paquetes, `lib/`, componentes compartidos y exports van primero y en secuencia. Nunca se ejecutan dos builds sobre el mismo directorio de salida.

| Rol | Resultado esperado | Límite |
| --- | --- | --- |
| spec | Borrador con criterios, archivos y dependencias | No implementa ni aprueba. |
| developer | Cambios delimitados y validación relevante | Necesita autorización humana vigente; no edita el registro de aprobaciones. |
| reviewer | APROBADO u OBSERVACIONES con evidencia | Sandbox de solo lectura, sin escalación de escritura. |

Los límites de alcance de spec/developer son instrucciones de trabajo; no se anuncian como un filtro de rutas del sistema operativo. El sandbox del reviewer sí se configura como `read-only`. Cuando un build o test escribe outputs, el agente principal lo ejecuta y el reviewer examina los comandos y artefactos.

## Aprobación humana

Se mantiene el flujo SDD de `docs/SETUP.md`: la spec vigente requiere aprobación expresa del usuario antes de su implementación. El formato de aprobación de las specs sigue siendo `apruebo docs/specs/<slug>.md`.

Los hooks de `.claude/` pertenecen a Claude Code. Codex no los instala ni ejecuta por leer estos archivos. Tampoco puede verificar como propia una firma HMAC generada en otra máquina. En Codex, el agente principal debe comprobar el mensaje real del usuario y la versión de la spec que se aprobó, mantener esa referencia en el informe de la tarea y detener la implementación si falta aprobación verificable. Nadie genera una firma de Claude ni altera `docs/specs/approvals.jsonl` para aparentar autorización. La aprobación de un reviewer de IA nunca sustituye la del usuario.

Este control del flujo en Codex es una instrucción explícita, no un hook técnico portado. Si el equipo requiere bloqueo automático, se debe implementar y probar un mecanismo de Codex compatible en una tarea específica antes de anunciarlo como activo.

## CI y revisión en GitHub

`.github/workflows/ci.yml` instala con lockfile y ejecuta lint, Vitest, generación de tipos, TypeScript y `build:worker`. Este último compila Next y ejecuta la limpieza de secretos del proyecto. Las acciones oficiales están fijadas a commits y el token tiene solo `contents: read`; checkout no persiste credenciales. No se ejecutan migraciones ni despliegues, no se aportan secretos de producción y no se usa `pull_request_target`.

El workflow debe ejecutarse en GitHub para verificarlo allí. Un parseo local correcto no acredita permisos, conectividad, disponibilidad del runner ni que los checks hayan pasado. Las fuentes se sirven desde `app/fonts/` con `next/font/local`, así que la compilación no depende de Google Fonts; los errores de red deben conservar su estado de fallo.

La revisión de Codex se activa mediante la integración nativa de GitHub en los ajustes de Codex para este repositorio. Tras habilitarla y verificar su acceso, el equipo puede solicitar una revisión en un PR con `@codex review` o configurar la revisión automática desde esa integración. Habilitar revisión, añadir el comentario o modificar permisos de GitHub son acciones externas distintas: los archivos del repositorio no las ejecutan. No se necesita una acción de IA con acceso de escritura al código del PR para el workflow de CI anterior.

Antes de habilitar la revisión, comprueba en los ajustes la cuenta/organización conectada, el repositorio seleccionado y el alcance de acceso. Si la integración no está disponible para la cuenta o la plataforma, registra esa limitación; no inventes secretos ni declares revisión automática activa. Documentación oficial: [configuración de Codex](https://developers.openai.com/codex/config-reference) y [integración de GitHub](https://developers.openai.com/codex/integrations/github).

Para que la revisión sea útil, el PR debe incluir problema y resultado, spec/tarea vigente, controles de acceso afectados, migraciones revisables, checks ejecutados y limitaciones. Codex debe priorizar defectos reproducibles, regresiones, aislamiento de cuentas/marcas, permisos y datos sensibles. CI y la revisión de IA se reportan por separado.

## Validación de cambios

Desde la raíz, con Node.js 24 y dependencias instaladas:

```sh
npm run lint
npm test -- --run --maxWorkers=3
./node_modules/.bin/next typegen
./node_modules/.bin/tsc --noEmit
npm run build:worker
```

Los tests deben ejecutar casos reales y terminar. Distingue errores del código, bloqueos del entorno y verificaciones pendientes. El liveness de `/api/health` no acredita base de datos ni autenticación. Los flujos autenticados se prueban con Clerk y Neon de desarrollo; nunca se inventan credenciales.

Después de modificar TOML, comprueba su sintaxis, las rutas de los roles y la carga con la versión instalada de Codex. Las claves y comportamientos del esquema oficial pueden cambiar: [esquema de configuración](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json).
