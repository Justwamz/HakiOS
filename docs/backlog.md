# HakiOS Backlog

Items deferred from Phase 1 plans, to be picked up in future plans.

---

## Backend

- **Seed script / initial admin setup** — add a `npm run db:seed` command (or `POST /auth/seed` endpoint, disabled in production) that creates the first admin user. Currently the only way to bootstrap a fresh deployment is a raw SQL INSERT. Should read credentials from env vars (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`) so nothing is hardcoded. Deferred from Plan 1c.

---

## Frontend

- **Edit pages** — `PUT /clients/:id` and `PUT /matters/:id` exist and are tested, but there are no edit UI pages yet. Detail pages intentionally omit the Edit button for now. Add `ClientEditPage` and `MatterEditPage` in a future plan. Deferred from Plan 1c.

- **Assignee name resolution** — Matter detail and list pages display raw UUIDs for `leadAdvocateId`, `supervisingPartnerId`, and `clerkIds`. Either enrich the API response with resolved names, or fetch `/users/assignable` on the detail page and resolve locally. Deferred from Plan 1c.

---

## Infrastructure / DX

- **ESM build for `@hakios/utils`** — currently `apps/web` uses a `resolve.alias` workaround in `vite.config.ts` because `@hakios/utils` only ships a CJS dist. Add an ESM output (`"module"` field in package.json, dual build in tsconfig) so Vite can tree-shake it properly. Deferred from Plan 1b.

- **Document storage (Cloudflare R2)** — the database schema has a `documents` table stub and env vars are reserved, but no upload/download logic exists. Full implementation deferred to Phase 2.
