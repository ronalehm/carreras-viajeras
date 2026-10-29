# Conciliación de PR #22, PR #23 y configuración de Codex

- Módulo: platform, accounts, crm
- Estado: borrador
- Documento de trazabilidad del plan cuya ejecución solicitó el usuario con
  «EJECUTAR EL PLAN DE AMBOS» el 29 de octubre de 2026. No añade ni firma una
  aprobación en el registro de Claude. Las funcionalidades integradas proceden de
  sus specs históricas aprobadas y de las decisiones posteriores de main.

## Objetivo

Conservar el modelo vigente de Clerk y CRM al conciliar las ramas antiguas, y
preparar instrucciones reproducibles de Codex y validación en GitHub.

## Requisitos y criterios de aceptación

1. PR #23 conserva `source` inmutable y `channel` editable y registra la sustitución
   explícita de crm-lead-sources por crm-journey-automation. Su diff funcional
   frente a main queda vacío; no añade la migración ni el evento alternativos.
2. PR #22 conserva todos los roles, contratos y objetos de main e integra únicamente
   perfiles F1–F2, patrocinadores F1–F2 y directorio F1. La propiedad de perfiles se
   decide en servidor, los roles no provienen de Clerk metadata y sponsor carece
   de permisos de CRM. Las fases posteriores quedan identificadas.
3. `0010` se genera desde el snapshot actual y respeta los objetos anteriores.
   Los tests y la validación PostgreSQL local no acceden a Neon ni a producción.
4. Las instrucciones de Codex conservan las reglas de Next, usan Clerk, mantienen
   aprobación humana y hacen al reviewer de solo lectura. No presentan los hooks
   de Claude como una protección instalada en Codex.
5. CI usa instalación con lockfile y permisos mínimos, verifica aplicación y Worker
   sin desplegar ni migrar. La revisión de IA requiere integración real, no una
   credencial ficticia o una afirmación de activación sin evidencia.
6. Las pruebas de las ramas y la auditoría completa distinguen defectos, bloqueos
   del entorno, checks no ejecutados y funcionalidades futuras.

## Entregas del plan

Cada entrega se descompone en tareas con archivos disjuntos al delegar; los cambios
de schema, autenticación, exports y documentación compartidos se hacen en secuencia.

### Fase 23 — Conciliación

- [x] T1 — Comparar criterios con contratos posteriores; informe en `docs/integrations/pr-23-lead-sources.md`.
- [x] T2 — Preservar historia y árbol vigente, comprobar diff y suite pertinente.
- [x] T3 — Actualizar la rama original por fast-forward y verificar su SHA remoto.

### Fase 22A — Datos y autorización

- [x] T1 — Schema y migración incremental; `lib/db-schema.ts`, SQL, snapshot y journal nuevos.
- [x] T2 — Guardas y permisos con sus tests; `lib/auth/{guards,access.service,permissions}.ts` y tests.
- [x] T3 — Schemas y etiquetas actuales; `modules/accounts/schemas/staff.schema.*`, `utils/staffDisplay.*`.

### Fase 22B — Perfil

- [x] T1 — Schemas, tipos, utilidades y services existentes del perfil con sus tests.
- [x] T2 — Acción y estados del perfil con pruebas de propiedad, consentimiento y errores.
- [x] T3 — Formulario, panel, cuenta y ruta, middleware y pruebas de cobertura Clerk.

### Fase 22C — Marcas

- [x] T1 — Schemas, tipos y services de `modules/sponsors`, con tests.
- [x] T2 — Acciones y formularios de marcas con guardas de servidor y tests.
- [x] T3 — Rutas y navegación del panel actual.

### Fase 22D — Directorio

- [x] T1 — Filtros, tipos y services del directorio con tests para todos los roles.
- [x] T2 — Listado y ficha, componentes y exports, conservando los roles gestionables.
- [x] T3 — Revalidación de lista/ficha en las acciones del equipo y sus pruebas.

### Fase 22E — Verificación

- [x] T1 — Suite completa, lint y tipos del árbol integrado; fixtures y SQL de viajes actualizados.
- [x] T2 — PostgreSQL local, build/Worker y revisión independiente; registrar bloqueos reales.
- [x] T3 — README e informe de integración; actualizar rama original y verificar SHA remoto.

### Fase Codex

- [x] T1 — AGENTS, config y tres roles de Codex, con validación de configuración.
- [x] T2 — CLAUDE, SETUP y guía de uso coherentes con Clerk y aprobación humana.
- [x] T3 — Workflow CI y guía para activar la revisión real de Codex en GitHub.
- [x] T4 — Auditoría completa del repositorio con hallazgos y evidencia, sin atribuir
  pruebas o activación remotas no comprobadas.

## Operación

Las operaciones remotas de migración, despliegue y publicación se tratan por
separado. Los errores de red y las credenciales faltantes se registran expresamente.

La configuración se guarda en el repositorio; la carga del proyecto confiable,
la activación de la integración de GitHub y la ejecución remota de CI permanecen
pendientes. Build/Workers no superaron el bloqueo de Google Fonts.
