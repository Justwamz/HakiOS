# HakiOS Backlog

Items deferred from Phase 1 plans, to be picked up in future plans.

---

## Infrastructure / DX

- **ESM build for `@hakios/utils`** — currently `apps/web` uses a `resolve.alias` workaround in `vite.config.ts` because `@hakios/utils` only ships a CJS dist. Add an ESM output (`"module"` field in package.json, dual build in tsconfig) so Vite can tree-shake it properly. Deferred from Plan 1b.

- **Document storage (Cloudflare R2)** — the database schema has a `documents` table stub and env vars are reserved, but no upload/download logic exists. Full implementation deferred to Phase 2.
