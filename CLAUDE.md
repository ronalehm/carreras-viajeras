# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Carreras Viajeras hackathon MVP. The current web app is the `Hello world` template; the earlier landing lives in another folder and is not part of this repository. Spanish is the working language.

**The parent `../CLAUDE.md` (Astro project) does NOT apply here.** This repo is a separate Next.js app nested inside that folder; ignore its Astro/`astro dev` instructions.

## Commands

```sh
npm run dev      # dev server (Turbopack) on http://localhost:3000
npm run build    # production build — the only full type check available
npm run lint     # ESLint (flat config, eslint.config.mjs)
npm test         # Vitest watch mode
npx vitest run path/to/file.test.ts  # single test file, one run
npx shadcn@latest add <component>   # add shadcn/ui components into components/ui/
npm run preview     # OpenNext build + run the Worker locally (wrangler)
npm run deploy      # OpenNext build + deploy to Cloudflare (ask the user first)
npm run cf-typegen  # regenerate cloudflare-env.d.ts after editing wrangler.jsonc
npm run build:worker # package OpenNext without deploying (Linux/WSL)
npm run db:generate  # generate local SQL for review; no remote migration
```

## Active foundation and environment

**Precedence:** approved phase 1 of `docs/specs/platform-neon-foundation.md` governs this preparation. Older specs with D1, provisional Hyperdrive or Access replacing RBAC are obsolete drafts, not executable setup instructions. Do not implement their infrastructure steps. Do not edit approved specs or the approval ledger as part of development.

Target: Cloudflare Workers Free via OpenNext, Neon PostgreSQL Free via Drizzle `neon-http` and `@neondatabase/serverless` (HTTPS), and managed Neon Auth (Better Auth based). No D1, Hyperdrive or second Better Auth server. Keep `ASSETS` and `WORKER_SELF_REFERENCE`; remote previews and `workers.dev` are disabled. Activate `carreras-viajeras.mentec.dev` only after deployment approval. Use Wrangler for this repo.

Next development reads `.env.local` copied from `.env.example`; local Wrangler/OpenNext reads `.dev.vars` copied from `.dev.vars.example`. Keep both private and consistent. Runtime requires `APP_ORIGIN` (exact origin), TLS `DATABASE_URL`, HTTPS `NEON_AUTH_BASE_URL` and random `NEON_AUTH_COOKIE_SECRET` of at least 32 characters. These are server-only; never expose values in errors, logs, `NEXT_PUBLIC_*`, examples or source control. Configure eventual Worker secrets with Cloudflare's secret mechanism. Do not require secrets or database access during build; validate lazily on requests.

`DATABASE_MIGRATION_URL` is a separate administrative credential reserved for future authorized migrations, never a Worker/n8n runtime secret. `npm run db:generate` generates reviewable SQL locally without credentials or applying it. The initial application schema is empty. Do not modify Neon Auth internal tables or add migration/push scripts that execute remotely as part of setup, build or startup.

`npm run build:worker` packages OpenNext without deployment. Run that verification on Linux/WSL with dependencies installed there; a successful Next build alone does not prove Workers compatibility. `npm run preview` builds with `NODE_ENV=production` and requires `APP_ORIGIN=https://carreras-viajeras.mentec.dev`, even for its local Worker. Treat preview as a local liveness smoke test until auth is validated with the intended domain. Localhost origins on ports 3000/8787 are accepted only in development (`npm run dev`). `npm run deploy` changes Cloudflare and requires explicit user approval; no automatic push, merge, DNS changes, remote migrations, resource creation or role assignment.

Neon Auth includes localhost preconfigured; if local authentication fails, check callback and origin configuration. The user confirmed Neon Email Sign-up and Sign-in ON. Trusted origin `https://carreras-viajeras.mentec.dev` is still unverified. Existing auth users do not become CRM staff automatically. Phase 1 adds no frontend, CRM RBAC, organization endpoints, lead form or outbox. Future CRM access needs verified email plus current administrative role by stable user ID, denied by default; Access is only an optional additional layer. Future leads need a Neon outbox and retryable processing by local n8n through a private API. WhatsApp Business App stays manual initially. PostHog is disabled by default; Gemini is optional and outside this phase.

`/api/health` is public liveness only: no database query or connection details. These foundation changes belong to PR #1 branch `claude/determined-cannon-bxoqo1`, not yet merged into `main`; use that branch before following this setup. Consult `README.md` for local setup and handoff steps.

Vitest runs in jsdom with Testing Library; `@/` alias resolved natively via `resolve.tsconfigPaths` (no vite-tsconfig-paths, no @vitejs/plugin-react — its latest version requires Babel 8 and conflicts with shadcn's Babel 7). Async Server Components can't be unit tested.

## Project rules: `docs/SETUP.md`

Read `docs/SETUP.md` before writing code. It is the source of truth for:
1. Folder structure — domain modules in `modules/<domain>/`, `app/` only routes, English names, naming conventions per file type.
2. Best practices — SOLID/DRY/KISS/YAGNI; before creating any component, hook or function, check it doesn't already exist in the project or in shadcn/ui.
3. Methodology — build mode vs SDD, spec template, reviewer checklist, which code needs unit tests.

## Workflow: SDD agents (`.claude/agents/`)

| Agent | Role |
|---|---|
| `orchestrator` | Classifies each request as **build** (small, clear change: ≤ 3 files, no new routes/API contracts) or **SDD**; plans, delegates, runs tasks in parallel when files don't overlap. Never writes code. |
| `spec` | Writes `docs/specs/<module>-<feature>.md` with a task plan (≤ 5 tasks / ~15 files per phase). Never approves specs. |
| `developer` | Implements an approved spec task or a build-mode change, with tests. Checks `Estado: aprobado` before touching files; never modifies `docs/specs/` (enforced by a hook in its frontmatter). |
| `reviewer` | Read-only. Validates against the spec/task and `docs/SETUP.md`; returns APROBADO or numbered OBSERVACIONES, looping with `developer` (max 3 cycles). |

Run the full flow with `claude --agent orchestrator` (it must be the main thread: subagents can't spawn subagents). Details in `docs/SETUP.md` §3.

**Human approval is a hard blocker.** No SDD implementation starts until the user writes exactly **"apruebo docs/specs/<slug>.md"** in the chat (bare "apruebo" or "apruebo <slug>" is rejected by the hook); a hook then changes its header from `Estado: borrador` to `Estado: aprobado` (the only two states) and logs who approved in `docs/specs/approvals.jsonl`, HMAC-signed with a per-machine key at `~/.claude/spec-approval.key` (unsigned/forged lines are ignored; approvals don't transfer between machines). After a successful approval the hook tells Claude to continue immediately with implementation following the orchestrator flow (`.claude/agents/orchestrator.md` §3 step 4: developer per task plan, then reviewer) — no second confirmation. Claude may only write specs with `Estado: borrador` (a Write/Edit hook blocks anything else) and never edits the ledger. This applies to every session, with or without the orchestrator: never infer approval, never mark a spec approved without the user's explicit answer, and any edit to an approved spec sends it back to `borrador`. Enforced by hooks in `.claude/settings.json` → `.claude/hooks/spec-approval.mjs` (tests: `npx vitest run .claude/hooks`): launching `developer` is blocked unless every spec its prompt cites has a logged approval and hasn't changed since (ticking plan checkboxes is fine), or the prompt declares `Modo: build`. Don't work around it. The user may edit code directly; these rules bind Claude.

## Stack

- Next.js 16 App Router (`app/`), React 19, TypeScript strict. Path alias `@/*` → repo root.
- Tailwind CSS v4 via `@tailwindcss/postcss`. No `tailwind.config.*` — theme tokens live in `app/globals.css` (`@theme inline` + CSS variables, `.dark` variant).
- shadcn/ui, style `base-nova`, built on **Base UI (`@base-ui/react`)**, not Radix. Icons: `lucide-react`. Config in `components.json`.
- `cn()` comes from the `cn` package (shadcn's replacement for clsx + tailwind-merge), re-exported from `lib/utils.ts`.
- Installed but not yet wired: axios, `@tanstack/react-query` (needs a `QueryClientProvider` client component in `app/layout.tsx` before use), `@tanstack/react-table` v9, zod v4, zustand v5.
- Next 16 typed route helpers are global (e.g. `LayoutProps<"/">`), generated into `.next/types` by dev/build.
