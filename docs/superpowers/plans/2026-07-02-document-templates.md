# Document Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let partners/admins upload reusable Word document templates (NDA, lease, affidavit, board resolution, etc.) with `{{variable}}` placeholders and a firm-logo image slot, and let any staff member quick-create a filled `.docx` for a specific client or matter, with full version history on every template.

**Architecture:** Three new Postgres tables (`document_templates`, `document_template_versions`, `generated_documents`) back a `templates` service that merges variables into a `.docx` via `docxtemplater` + `docxtemplater-image-module-free`, reading/writing files through a new thin Cloudflare R2 wrapper (`apps/api/src/lib/r2.ts`) — the project's first real R2 code. Frontend entry point is the client/matter detail page ("Generate Document" button), with a separate `/templates` page for template management. Follows the existing Express 4 + Zod + `requireAuth`/`requireRole` + React 18 + react-hook-form patterns used by `clients`/`matters`.

**Tech Stack:** TypeScript 5 strict, Express 4, `pg` (raw SQL), Zod, `multer` (new — memory storage), `docxtemplater` + `pizzip` + `docxtemplater-image-module-free` (new), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (new, R2 is S3-API-compatible), React 18, Vite 5, react-hook-form + Zod, Tailwind custom tokens, React Router v6, Vitest + Supertest.

## Global Constraints

- TypeScript strict: `noUncheckedIndexedAccess: true` — `rows[0]` access must be `const r = rows[0]; if (!r) ...` — never `if (!rows[0]) ...; const r = rows[0]`
- React Rules of Hooks: permission guards (`return <Navigate />`) MUST come AFTER all `useState` / `useForm` / `useEffect` declarations — never before
- Tailwind custom design tokens only — no raw hex/rgb colors; reuse the exact utility class names already used in `apps/web/src/pages/clients/CreateClientPage.tsx` (`INPUT_CLASS`, `LABEL_CLASS` local constants) — don't invent new global CSS classes like `input-field`/`btn-primary` that don't exist in this codebase
- RBAC: `requireAuth`, then `requireRole('permission:name')` for hard gates, or inline `hasPermission(req.user!.role, ...)` for read_all vs read_assigned-style branching
- `req.user!.id` post-`requireAuth` — middleware-guaranteed, codebase-wide convention
- `as Error` in catch blocks — project convention
- Integration tests require a live PostgreSQL DB — `ECONNREFUSED` expected locally; this is a pre-existing constraint, not a bug
- All new user-facing error messages must be plain English with no jargon (see `docs/superpowers/specs/2026-07-02-document-templates-design.md` Section 8) — exact wording is specified per error case below, use it verbatim
- Commit after every task. Do not push to `origin/master` — this plan is executed in an isolated worktree; pushing/merging happens once, at the end, via the finishing-a-development-branch process

---

### Task 1: Database schema, shared types, and permissions

**Files:**
- Create: `apps/api/src/db/migrations/003_document_templates.sql`
- Create: `packages/types/src/template.ts`
- Modify: `packages/types/src/settings.ts` — add `logoKey` to `FirmProfile`
- Modify: `packages/types/src/permissions.ts` — add `templates:manage`, `templates:use`
- Modify: `packages/types/src/index.ts` — export `template.ts`

**Interfaces:**
- Produces: `DocumentTemplate`, `DocumentTemplateVersion`, `DocumentTemplateDetail`, `GeneratedDocument`, `GenerateDocumentResult` — consumed by Tasks 4, 5, 6, 7
- Produces: `templates:manage`, `templates:use` permissions — consumed by Tasks 5, 6, 7
- Produces: `FirmProfile.logoKey: string | null` — consumed by Tasks 3, 4, 8

- [ ] **Step 1: Write the migration**

Create `apps/api/src/db/migrations/003_document_templates.sql`:

```sql
-- ── Document Templates ─────────────────────────────────────────────────────

CREATE TABLE document_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_template_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  file_key        TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  change_note     TEXT NOT NULL,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number)
);

CREATE TABLE generated_documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id           UUID REFERENCES document_templates(id) ON DELETE SET NULL,
  template_version_id   UUID REFERENCES document_template_versions(id) ON DELETE SET NULL,
  template_name         TEXT NOT NULL,
  client_id             UUID NOT NULL REFERENCES clients(id),
  matter_id             UUID REFERENCES matters(id),
  file_key              TEXT NOT NULL,
  file_name             TEXT NOT NULL,
  generated_by          UUID REFERENCES users(id),
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_template_versions_template ON document_template_versions (template_id);
CREATE INDEX idx_generated_documents_client ON generated_documents (client_id);
CREATE INDEX idx_generated_documents_matter ON generated_documents (matter_id);
```

- [ ] **Step 2: Run the migration**

```bash
npm run db:migrate --workspace=apps/api
```

Expected: `ran 003_document_templates.sql` if you have a local Postgres reachable at `DATABASE_URL`; `ECONNREFUSED` is expected and fine if you don't — the migration will run on Render on next deploy.

- [ ] **Step 3: Create `packages/types/src/template.ts`**

```typescript
export interface DocumentTemplate {
  id: string
  name: string
  category: string
  createdBy: string | null
  createdAt: string
  latestVersion: number
  latestVersionNote: string
  latestVersionAt: string
}

export interface DocumentTemplateVersion {
  id: string
  templateId: string
  versionNumber: number
  fileName: string
  changeNote: string
  createdBy: string | null
  createdAt: string
}

export interface DocumentTemplateDetail extends DocumentTemplate {
  versions: DocumentTemplateVersion[]
}

export interface GeneratedDocument {
  id: string
  templateId: string | null
  templateVersionId: string | null
  templateName: string
  clientId: string
  matterId: string | null
  fileName: string
  generatedBy: string | null
  generatedAt: string
}

export interface GenerateDocumentResult {
  document: GeneratedDocument
  downloadUrl: string
  warnings: string[]
}
```

- [ ] **Step 4: Add `logoKey` to `FirmProfile`**

In `packages/types/src/settings.ts`, replace the `FirmProfile` interface:

```typescript
export interface FirmProfile {
  firmName: string
  address: string
  phone: string
  email: string
  logoKey: string | null
}
```

- [ ] **Step 5: Add template permissions**

In `packages/types/src/permissions.ts`, replace the file contents:

```typescript
import type { Role } from './user.js'

export type Permission =
  | 'clients:read_all'
  | 'clients:read_assigned'
  | 'clients:create'
  | 'clients:edit'
  | 'matters:read_all'
  | 'matters:read_assigned'
  | 'matters:create'
  | 'matters:edit'
  | 'matters:close'
  | 'calendar:read_all'
  | 'calendar:read_assigned'
  | 'calendar:create'
  | 'users:manage'
  | 'settings:manage'
  | 'audit:view'
  | 'audit:export'
  | 'templates:manage'
  | 'templates:use'

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'clients:read_all', 'clients:create', 'clients:edit',
    'matters:read_all', 'matters:create', 'matters:edit', 'matters:close',
    'calendar:read_all', 'calendar:create',
    'users:manage', 'settings:manage',
    'audit:view', 'audit:export',
    'templates:manage', 'templates:use',
  ],
  partner: [
    'clients:read_all', 'clients:create', 'clients:edit',
    'matters:read_all', 'matters:create', 'matters:edit', 'matters:close',
    'calendar:read_all', 'calendar:create',
    'audit:view',
    'templates:manage', 'templates:use',
  ],
  associate: [
    'clients:read_assigned', 'clients:create', 'clients:edit',
    'matters:read_assigned', 'matters:create', 'matters:edit',
    'calendar:read_assigned', 'calendar:create',
    'templates:use',
  ],
  clerk: [
    'clients:read_assigned',
    'matters:read_assigned',
    'calendar:read_assigned', 'calendar:create',
    'templates:use',
  ],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}
```

- [ ] **Step 6: Export the new type module**

In `packages/types/src/index.ts`, add:

```typescript
export * from './template.js'
```

(Add this alongside the existing `export * from './...'` lines — check the file for the exact existing list and insert in the same style.)

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck --workspace=@hakios/types
npm run typecheck --workspace=apps/api
npm run typecheck --workspace=apps/web
```

Expected: 0 errors (the new fields/types are additive).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/db/migrations/003_document_templates.sql packages/types/src/template.ts packages/types/src/settings.ts packages/types/src/permissions.ts packages/types/src/index.ts
git commit -m "feat: document template schema, types, and permissions"
```

---

### Task 2: Backend dependencies and Cloudflare R2 storage wrapper

**Files:**
- Modify: `apps/api/package.json` — add dependencies
- Create: `apps/api/src/lib/r2.ts`

**Interfaces:**
- Produces: `putObject(key, body, contentType)`, `getObject(key)`, `getSignedDownloadUrl(key, expirySeconds?)`, `deleteObject(key)` — all exported from `apps/api/src/lib/r2.ts`, consumed by Task 3 (logo) and Task 4 (templates service)

- [ ] **Step 1: Install dependencies**

```bash
npm install docxtemplater@^3.50.0 pizzip@^3.1.6 docxtemplater-image-module-free@^1.1.1 multer@^1.4.5-lts.1 @aws-sdk/client-s3@^3.600.0 @aws-sdk/s3-request-presigner@^3.600.0 --workspace=apps/api
npm install --save-dev @types/multer@^1.4.11 --workspace=apps/api
```

- [ ] **Step 2: Create `apps/api/src/lib/r2.ts`**

```typescript
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

function client(): S3Client {
  const accountId = process.env['CLOUDFLARE_R2_ACCOUNT_ID']
  const accessKeyId = process.env['CLOUDFLARE_R2_ACCESS_KEY_ID']
  const secretAccessKey = process.env['CLOUDFLARE_R2_SECRET_ACCESS_KEY']
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Cloudflare R2 environment variables are not configured')
  }
  return new S3Client({
    region: 'auto',
    endpoint: process.env['CLOUDFLARE_R2_ENDPOINT'] ?? `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

function bucket(): string {
  return process.env['CLOUDFLARE_R2_BUCKET_NAME'] ?? 'hakios-documents'
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  )
}

export async function getObject(key: string): Promise<Buffer> {
  const result = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
  const chunks: Uint8Array[] = []
  const stream = result.Body as AsyncIterable<Uint8Array>
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

export async function getSignedDownloadUrl(key: string, expirySeconds = 300): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket(), Key: key })
  return getSignedUrl(client(), command, { expiresIn: expirySeconds })
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}
```

Note: there is no dedicated `r2.test.ts` — this thin wrapper is exercised indirectly through the `templates.test.ts` integration tests in Task 5, the same way the rest of this codebase treats infra it can't unit-test in isolation (matches the existing "requires live DB" convention, just for R2 instead of Postgres).

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/lib/r2.ts
git commit -m "feat: add R2 storage wrapper and docx/upload dependencies"
```

---

### Task 3: Shared settings service and firm logo upload

**Files:**
- Create: `apps/api/src/services/settings.ts`
- Modify: `apps/api/src/routes/settings.ts` — use the shared service instead of its private `getSetting`, add logo upload route
- Test: `apps/api/src/__tests__/settings.test.ts` — add logo upload tests (extend the existing file, don't replace it)

**Interfaces:**
- Produces: `getSetting<T>(key, fallback)`, `getFirmProfile()`, `FIRM_FALLBACK` — exported from `apps/api/src/services/settings.ts`, consumed by Task 4 (`getFirmProfile` for document variables) and by `routes/settings.ts` itself
- Consumes: `putObject`, `getSignedDownloadUrl` from `apps/api/src/lib/r2.ts` (Task 2)

- [ ] **Step 1: Extract the shared settings service**

Create `apps/api/src/services/settings.ts`:

```typescript
import { db } from '../db/client.js'
import type { FirmProfile } from '@hakios/types'

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { rows } = await db.query<{ value: T }>('SELECT value FROM settings WHERE key = $1', [key])
  return rows[0]?.value ?? fallback
}

export const FIRM_FALLBACK: FirmProfile = {
  firmName: '', address: '', phone: '', email: '', logoKey: null,
}

export async function getFirmProfile(): Promise<FirmProfile> {
  return getSetting<FirmProfile>('firm_profile', FIRM_FALLBACK)
}

export async function setFirmLogo(logoKey: string | null, userId: string): Promise<FirmProfile> {
  const current = await getFirmProfile()
  const updated: FirmProfile = { ...current, logoKey }
  await db.query(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES ('firm_profile', $1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = now()`,
    [JSON.stringify(updated), userId],
  )
  return updated
}
```

- [ ] **Step 2: Update `apps/api/src/routes/settings.ts` to use the shared service**

Replace the top of the file (imports through the `FIRM_FALLBACK`/`CASE_NUMBER_FALLBACK` constants and the `GET /` handler) with:

```typescript
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import type { Request, Response, NextFunction } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { db } from '../db/client.js'
import { createError } from '../middleware/errorHandler.js'
import { getSetting, getFirmProfile, setFirmLogo } from '../services/settings.js'
import { putObject, getSignedDownloadUrl } from '../lib/r2.js'
import type { CaseNumberSettings, MatterTypeCode, ReminderSchedule } from '@hakios/types'

export const settingsRouter = Router()

const CASE_NUMBER_FALLBACK: CaseNumberSettings = {
  firmPrefix: 'LF', includeTypeCode: true, includeYear: true, sequenceDigits: 5, separator: '/',
}

settingsRouter.get('/', requireAuth, async (_req, res, next) => {
  try {
    const [firm, caseNumber] = await Promise.all([
      getFirmProfile(),
      getSetting<CaseNumberSettings>('case_number', CASE_NUMBER_FALLBACK),
    ])
    res.json({ firm, caseNumber })
  } catch (err) {
    next(err)
  }
})
```

Leave every other route in the file (`PUT /firm`, `PUT /case-number`, matter-types, reminder-schedules) exactly as-is below this point — only the top section above changes. Note the `PUT /firm` route's `firmSchema` doesn't include `logoKey`, which is correct: the logo is managed by its own dedicated upload route below, not through the firm-profile text form.

- [ ] **Step 3: Add the logo upload route**

At the end of `apps/api/src/routes/settings.ts`, add:

```typescript
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'image/png' && file.mimetype !== 'image/jpeg') return cb(null, false)
    cb(null, true)
  },
})

function handleLogoUpload(req: Request, res: Response, next: NextFunction): void {
  logoUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(createError('This file is too large. Please upload a file smaller than 2MB.', 400, 'FILE_TOO_LARGE'))
    }
    if (err) return next(err)
    next()
  })
}

settingsRouter.post(
  '/logo',
  requireAuth,
  requireRole('settings:manage'),
  handleLogoUpload,
  async (req, res, next) => {
    try {
      if (!req.file) {
        return next(createError('Please upload a PNG or JPEG image.', 400, 'VALIDATION_ERROR'))
      }
      const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg'
      const key = `branding/logo.${ext}`
      await putObject(key, req.file.buffer, req.file.mimetype)
      const firm = await setFirmLogo(key, req.user!.id)
      res.json(firm)
    } catch (err) {
      next(err)
    }
  },
)

settingsRouter.delete('/logo', requireAuth, requireRole('settings:manage'), async (req, res, next) => {
  try {
    const firm = await setFirmLogo(null, req.user!.id)
    res.json(firm)
  } catch (err) {
    next(err)
  }
})

settingsRouter.get('/logo', requireAuth, async (_req, res, next) => {
  try {
    const firm = await getFirmProfile()
    if (!firm.logoKey) return res.json({ downloadUrl: null })
    const downloadUrl = await getSignedDownloadUrl(firm.logoKey)
    res.json({ downloadUrl })
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 4: Write the failing tests**

In `apps/api/src/__tests__/settings.test.ts`, find the existing `beforeAll`/`afterAll` and admin-token setup (reuse the existing `adminToken` variable already in that file — do not create a new one), and add this new `describe` block:

```typescript
describe('POST /api/settings/logo', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/settings/logo')
    expect(res.status).toBe(401)
  })

  it('uploads a PNG logo and returns the updated firm profile', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    )
    const res = await request(app)
      .post('/api/settings/logo')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', png, { filename: 'logo.png', contentType: 'image/png' })
    expect(res.status).toBe(200)
    expect(res.body.logoKey).toBe('branding/logo.png')
  })

  it('rejects a file that is too large', async () => {
    const big = Buffer.alloc(3 * 1024 * 1024, 1)
    const res = await request(app)
      .post('/api/settings/logo')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', big, { filename: 'logo.png', contentType: 'image/png' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('This file is too large. Please upload a file smaller than 2MB.')
  })

  it('rejects a non-image file', async () => {
    const res = await request(app)
      .post('/api/settings/logo')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('not an image'), { filename: 'logo.txt', contentType: 'text/plain' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Please upload a PNG or JPEG image.')
  })
})

describe('GET /api/settings/logo', () => {
  it('returns null downloadUrl when no logo is set', async () => {
    await request(app)
      .delete('/api/settings/logo')
      .set('Authorization', `Bearer ${adminToken}`)
    const res = await request(app)
      .get('/api/settings/logo')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.downloadUrl).toBeNull()
  })
})
```

- [ ] **Step 5: Run tests to confirm they fail**

```bash
cd apps/api && npm run test -- settings
```

Expected: connection errors (`ECONNREFUSED`) locally without a live DB/R2, or clear failures if you do have both configured (route doesn't exist yet). Either way, confirm they fail before implementing — if `putObject`/`getSignedDownloadUrl` throw because R2 env vars aren't set in your local `.env`, that's expected too; these tests genuinely need live R2 credentials to pass, same as DB-dependent tests need a live Postgres.

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd apps/api && npm run test -- settings
```

Expected: PASS (with live DB + R2 credentials configured — e.g. on Render, or a local `.env` pointed at a real R2 bucket).

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/settings.ts apps/api/src/routes/settings.ts apps/api/src/__tests__/settings.test.ts
git commit -m "feat: firm logo upload endpoint"
```

---

### Task 4: Templates service — CRUD, versioning, and document generation

**Files:**
- Create: `apps/api/src/services/templates.ts`
- Test: `apps/api/src/__tests__/templates.test.ts` (service-level tests only in this task — route tests are Task 5)

**Interfaces:**
- Consumes: `putObject`, `getObject`, `getSignedDownloadUrl` from `../lib/r2.js` (Task 2); `getFirmProfile` from `../services/settings.js` (Task 3); `getClient` from `./clients.js`; `getMatter` from `./matters.js`
- Produces: `listTemplates(category?)`, `getTemplateDetail(id)`, `createTemplate(input)`, `addTemplateVersion(templateId, input)`, `deleteTemplate(id)`, `getTemplateVersionDownloadUrl(templateId, versionId)`, `generateDocument(input)`, `listGeneratedDocuments(filter)`, `getGeneratedDocumentDownloadUrl(id)` — all exported from `apps/api/src/services/templates.ts`, consumed by Task 5 (routes)

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/__tests__/templates.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import { db } from '../db/client.js'
import { hashPassword } from '../lib/password.js'
import * as templatesService from '../services/templates.js'

let adminId: string
let clientId: string
const testEmail = `tmpl-${randomUUID()}@test.com`

// Minimal valid .docx: a single paragraph containing "Hello {{client_name}}, unknown: {{not_a_real_tag}}"
// Generated once and checked into the test as a fixture would be ideal, but to keep this
// self-contained we build a minimal docx in-memory using pizzip + docxtemplater's own
// zip structure requirements are non-trivial to hand-construct; instead this test uses
// a tiny fixture file. See Step 2 below for creating it.
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = join(__dirname, 'fixtures', 'sample-template.docx')

beforeAll(async () => {
  const hash = await hashPassword('Test@1234!')
  const { rows: a } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ($1, $2, 'Template', 'Tester', 'partner')
     ON CONFLICT (email) DO UPDATE SET password_hash = $2 RETURNING id`,
    [testEmail, hash],
  )
  adminId = a[0]!.id

  const year = new Date().getFullYear()
  const { rows: c } = await db.query<{ id: string }>(
    `INSERT INTO clients (client_id, client_type, full_name, email, created_by, updated_by)
     VALUES ($1, 'individual', 'Template Test Client', 'client@test.com', $2, $2) RETURNING id`,
    [`CLT-${year}-99997`, adminId],
  )
  clientId = c[0]!.id
})

afterAll(async () => {
  await db.query('DELETE FROM generated_documents WHERE client_id = $1', [clientId])
  await db.query('DELETE FROM document_templates WHERE created_by = $1', [adminId])
  await db.query('DELETE FROM clients WHERE id = $1', [clientId])
  await db.query('DELETE FROM users WHERE email = $1', [testEmail])
  await db.end()
})

describe('createTemplate + listTemplates', () => {
  it('creates a template as version 1 with an "Initial version" note', async () => {
    const fileBuffer = readFileSync(FIXTURE_PATH)
    const template = await templatesService.createTemplate({
      name: 'Test NDA',
      category: 'NDA',
      fileBuffer,
      fileName: 'sample-template.docx',
      userId: adminId,
    })
    expect(template.name).toBe('Test NDA')
    expect(template.latestVersion).toBe(1)
    expect(template.latestVersionNote).toBe('Initial version')

    const list = await templatesService.listTemplates()
    expect(list.some((t) => t.id === template.id)).toBe(true)
  })
})

describe('addTemplateVersion', () => {
  it('increments version number and stores the change note', async () => {
    const fileBuffer = readFileSync(FIXTURE_PATH)
    const template = await templatesService.createTemplate({
      name: 'Versioned Template',
      category: 'Lease',
      fileBuffer,
      fileName: 'sample-template.docx',
      userId: adminId,
    })
    const version2 = await templatesService.addTemplateVersion(template.id, {
      fileBuffer,
      fileName: 'sample-template-v2.docx',
      changeNote: 'Updated clause 5 per new rent law',
      userId: adminId,
    })
    expect(version2.versionNumber).toBe(2)

    const detail = await templatesService.getTemplateDetail(template.id)
    expect(detail?.versions).toHaveLength(2)
    expect(detail?.latestVersion).toBe(2)
  })
})

describe('generateDocument', () => {
  it('fills client variables and flags unrecognized placeholders', async () => {
    const fileBuffer = readFileSync(FIXTURE_PATH)
    const template = await templatesService.createTemplate({
      name: 'Generate Test Template',
      category: 'NDA',
      fileBuffer,
      fileName: 'sample-template.docx',
      userId: adminId,
    })

    const result = await templatesService.generateDocument({
      templateId: template.id,
      clientId,
      matterId: undefined,
      userId: adminId,
    })

    expect(result.document.clientId).toBe(clientId)
    expect(result.document.matterId).toBeNull()
    expect(result.downloadUrl).toContain('http')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toBe(
      "This template has a spot we couldn't fill in automatically. The document was still created, but you'll need to fill that part in yourself.",
    )

    const history = await templatesService.listGeneratedDocuments({ clientId })
    expect(history.some((d) => d.id === result.document.id)).toBe(true)
  })
})
```

- [ ] **Step 2: Create the test fixture**

The tests above need a real minimal `.docx` file containing the text `Hello {{client_name}}, unknown: {{not_a_real_tag}}`. Create it once, by hand, in Word/LibreOffice/Google Docs (type that exact line into a blank document and save as `.docx`), then save it as:

`apps/api/src/__tests__/fixtures/sample-template.docx`

This is a binary file — there's no code to write for this step, just create the file and place it at that exact path. Confirm it exists before continuing:

```bash
ls apps/api/src/__tests__/fixtures/sample-template.docx
```

Expected: the file is listed (not "No such file or directory").

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd apps/api && npm run test -- templates
```

Expected: `Cannot find module '../services/templates.js'` (or `ECONNREFUSED` if you also lack a local DB — either failure is correct at this point, since neither the service nor a live DB connection is required to fail for the right reason).

- [ ] **Step 4: Create `apps/api/src/services/templates.ts`**

```typescript
import { randomUUID } from 'crypto'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import ImageModule from 'docxtemplater-image-module-free'
import { db } from '../db/client.js'
import { putObject, getObject, getSignedDownloadUrl } from '../lib/r2.js'
import { getFirmProfile } from './settings.js'
import { getClient } from './clients.js'
import { getMatter } from './matters.js'
import type {
  DocumentTemplate,
  DocumentTemplateDetail,
  DocumentTemplateVersion,
  GeneratedDocument,
  GenerateDocumentResult,
} from '@hakios/types'

const UNRESOLVED_PLACEHOLDER_WARNING =
  "This template has a spot we couldn't fill in automatically. The document was still created, but you'll need to fill that part in yourself."

// 1x1 transparent PNG, used when a template includes the {%firm_logo} image tag but no logo has been uploaded yet
const BLANK_LOGO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function toTemplate(row: Record<string, unknown>): DocumentTemplate {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    category: row['category'] as string,
    createdBy: (row['created_by'] as string | null) ?? null,
    createdAt: (row['created_at'] as Date).toISOString(),
    latestVersion: Number(row['latest_version']),
    latestVersionNote: row['latest_version_note'] as string,
    latestVersionAt: (row['latest_version_at'] as Date).toISOString(),
  }
}

const TEMPLATE_SELECT = `
  SELECT
    dt.id, dt.name, dt.category, dt.created_by, dt.created_at,
    dtv.version_number AS latest_version,
    dtv.change_note AS latest_version_note,
    dtv.created_at AS latest_version_at
  FROM document_templates dt
  JOIN document_template_versions dtv ON dtv.template_id = dt.id
  WHERE dtv.version_number = (
    SELECT MAX(version_number) FROM document_template_versions WHERE template_id = dt.id
  )
`

export async function listTemplates(category?: string): Promise<DocumentTemplate[]> {
  const where = category ? 'AND dt.category = $1' : ''
  const params = category ? [category] : []
  const { rows } = await db.query(
    `${TEMPLATE_SELECT} ${where} ORDER BY dt.category, dt.name`,
    params,
  )
  return rows.map(toTemplate)
}

function toVersion(row: Record<string, unknown>): DocumentTemplateVersion {
  return {
    id: row['id'] as string,
    templateId: row['template_id'] as string,
    versionNumber: Number(row['version_number']),
    fileName: row['file_name'] as string,
    changeNote: row['change_note'] as string,
    createdBy: (row['created_by'] as string | null) ?? null,
    createdAt: (row['created_at'] as Date).toISOString(),
  }
}

export async function getTemplateDetail(id: string): Promise<DocumentTemplateDetail | null> {
  const { rows } = await db.query(`${TEMPLATE_SELECT} AND dt.id = $1`, [id])
  const row = rows[0]
  if (!row) return null

  const { rows: versionRows } = await db.query(
    `SELECT id, template_id, version_number, file_name, change_note, created_by, created_at
     FROM document_template_versions WHERE template_id = $1 ORDER BY version_number DESC`,
    [id],
  )
  return { ...toTemplate(row), versions: versionRows.map(toVersion) }
}

interface CreateTemplateArgs {
  name: string
  category: string
  fileBuffer: Buffer
  fileName: string
  userId: string
}

export async function createTemplate(args: CreateTemplateArgs): Promise<DocumentTemplate> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO document_templates (name, category, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [args.name, args.category, args.userId],
  )
  const row = rows[0]
  if (!row) throw new Error('Insert failed')
  const templateId = row.id

  const fileKey = `templates/${templateId}/v1.docx`
  await putObject(
    fileKey,
    args.fileBuffer,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  await db.query(
    `INSERT INTO document_template_versions
       (template_id, version_number, file_key, file_name, change_note, created_by)
     VALUES ($1, 1, $2, $3, 'Initial version', $4)`,
    [templateId, fileKey, args.fileName, args.userId],
  )

  const detail = await getTemplateDetail(templateId)
  if (!detail) throw new Error('Template not found after insert')
  return detail
}

interface AddVersionArgs {
  fileBuffer: Buffer
  fileName: string
  changeNote: string
  userId: string
}

export async function addTemplateVersion(
  templateId: string,
  args: AddVersionArgs,
): Promise<DocumentTemplateVersion> {
  const { rows } = await db.query<{ max: number | null }>(
    `SELECT MAX(version_number) AS max FROM document_template_versions WHERE template_id = $1`,
    [templateId],
  )
  const currentMax = rows[0]?.max ?? 0
  const nextVersion = currentMax + 1

  const fileKey = `templates/${templateId}/v${nextVersion}.docx`
  await putObject(
    fileKey,
    args.fileBuffer,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  const { rows: inserted } = await db.query(
    `INSERT INTO document_template_versions
       (template_id, version_number, file_key, file_name, change_note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, template_id, version_number, file_name, change_note, created_by, created_at`,
    [templateId, nextVersion, fileKey, args.fileName, args.changeNote, args.userId],
  )
  const row = inserted[0]
  if (!row) throw new Error('Insert failed')
  return toVersion(row)
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const { rowCount } = await db.query('DELETE FROM document_templates WHERE id = $1', [id])
  return (rowCount ?? 0) > 0
}

export async function getTemplateVersionDownloadUrl(
  templateId: string,
  versionId: string,
): Promise<string | null> {
  const { rows } = await db.query<{ file_key: string }>(
    `SELECT file_key FROM document_template_versions WHERE id = $1 AND template_id = $2`,
    [versionId, templateId],
  )
  const row = rows[0]
  if (!row) return null
  return getSignedDownloadUrl(row.file_key)
}

interface GenerateArgs {
  templateId: string
  clientId?: string
  matterId?: string
  userId: string
}

export async function generateDocument(args: GenerateArgs): Promise<GenerateDocumentResult> {
  const { rows: versionRows } = await db.query<{
    id: string
    file_key: string
    template_id: string
  }>(
    `SELECT dtv.id, dtv.file_key, dtv.template_id
     FROM document_template_versions dtv
     WHERE dtv.template_id = $1
     ORDER BY dtv.version_number DESC
     LIMIT 1`,
    [args.templateId],
  )
  const latestVersion = versionRows[0]
  if (!latestVersion) throw new Error('Template has no versions')

  const { rows: templateRows } = await db.query<{ name: string }>(
    'SELECT name FROM document_templates WHERE id = $1',
    [args.templateId],
  )
  const templateName = templateRows[0]?.name ?? 'Unknown template'

  let resolvedClientId = args.clientId ?? null
  let resolvedMatterId = args.matterId ?? null
  const matter = args.matterId ? await getMatter(args.matterId) : null
  if (matter) resolvedClientId = matter.clientId
  if (!resolvedClientId) throw new Error('Either clientId or matterId is required')

  const client = await getClient(resolvedClientId)
  const firm = await getFirmProfile()
  const { rows: userRows } = await db.query<{ first_name: string; last_name: string }>(
    'SELECT first_name, last_name FROM users WHERE id = $1',
    [args.userId],
  )
  const generatingUser = userRows[0]

  const variables: Record<string, string> = {
    client_name: client.fullName,
    client_email: client.email ?? '',
    client_phone: client.phone ?? '',
    client_id: client.clientId,
    client_type: client.clientType,
    client_kra_pin: client.kraPin ?? '',
    client_address: client.postalAddress ?? '',
    matter_number: matter?.matterNumber ?? '',
    matter_description: matter?.description ?? '',
    matter_type: matter?.matterType ?? '',
    matter_date_opened: matter?.dateOpened ?? '',
    firm_name: firm.firmName,
    firm_address: firm.address,
    firm_phone: firm.phone,
    firm_email: firm.email,
    today_date: new Date().toISOString().slice(0, 10),
    generated_by_name: generatingUser ? `${generatingUser.first_name} ${generatingUser.last_name}` : '',
  }

  const logoBuffer = firm.logoKey ? await getObject(firm.logoKey) : BLANK_LOGO

  const templateBuffer = await getObject(latestVersion.file_key)
  const zip = new PizZip(templateBuffer)

  const unresolvedTags = new Set<string>()
  const imageModule = new ImageModule({
    centered: false,
    getImage: (tagValue: Buffer) => tagValue,
    getSize: (): [number, number] => [120, 60],
  })

  const doc = new Docxtemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: (part: { module?: string; value: string }) => {
      if (part.module) return ''
      unresolvedTags.add(part.value)
      return ''
    },
  })

  doc.render({ ...variables, firm_logo: logoBuffer })
  const outputBuffer = doc.getZip().generate({ type: 'nodebuffer' }) as Buffer

  const documentId = randomUUID()
  const outputKey = `generated/${documentId}.docx`
  const outputFileName = `${templateName} - ${client.fullName}.docx`
  await putObject(
    outputKey,
    outputBuffer,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )

  await db.query(
    `INSERT INTO generated_documents
       (id, template_id, template_version_id, template_name, client_id, matter_id, file_key, file_name, generated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      documentId,
      args.templateId,
      latestVersion.id,
      templateName,
      resolvedClientId,
      resolvedMatterId,
      outputKey,
      outputFileName,
      args.userId,
    ],
  )

  const downloadUrl = await getSignedDownloadUrl(outputKey)
  const warnings = unresolvedTags.size > 0 ? [UNRESOLVED_PLACEHOLDER_WARNING] : []

  return {
    document: {
      id: documentId,
      templateId: args.templateId,
      templateVersionId: latestVersion.id,
      templateName,
      clientId: resolvedClientId,
      matterId: resolvedMatterId,
      fileName: outputFileName,
      generatedBy: args.userId,
      generatedAt: new Date().toISOString(),
    },
    downloadUrl,
    warnings,
  }
}

function toGeneratedDocument(row: Record<string, unknown>): GeneratedDocument {
  return {
    id: row['id'] as string,
    templateId: (row['template_id'] as string | null) ?? null,
    templateVersionId: (row['template_version_id'] as string | null) ?? null,
    templateName: row['template_name'] as string,
    clientId: row['client_id'] as string,
    matterId: (row['matter_id'] as string | null) ?? null,
    fileName: row['file_name'] as string,
    generatedBy: (row['generated_by'] as string | null) ?? null,
    generatedAt: (row['generated_at'] as Date).toISOString(),
  }
}

interface ListGeneratedFilter {
  clientId?: string
  matterId?: string
}

export async function listGeneratedDocuments(filter: ListGeneratedFilter): Promise<GeneratedDocument[]> {
  const conditions: string[] = []
  const params: unknown[] = []
  let i = 1
  if (filter.clientId) { conditions.push(`client_id = $${i++}`); params.push(filter.clientId) }
  if (filter.matterId) { conditions.push(`matter_id = $${i++}`); params.push(filter.matterId) }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await db.query(
    `SELECT * FROM generated_documents ${where} ORDER BY generated_at DESC`,
    params,
  )
  return rows.map(toGeneratedDocument)
}

export async function getGeneratedDocumentDownloadUrl(id: string): Promise<string | null> {
  const { rows } = await db.query<{ file_key: string }>(
    'SELECT file_key FROM generated_documents WHERE id = $1',
    [id],
  )
  const row = rows[0]
  if (!row) return null
  return getSignedDownloadUrl(row.file_key)
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/api && npm run test -- templates
```

Expected: PASS, given a live DB and R2 credentials, and the fixture file from Step 2 in place. If `docxtemplater`/`docxtemplater-image-module-free`'s exact API differs slightly from what's written above (library versions do shift constructor options and module interfaces), fix the mismatch here based on the actual error message — this is exactly what this test step is for.

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/templates.ts apps/api/src/__tests__/templates.test.ts apps/api/src/__tests__/fixtures/sample-template.docx
git commit -m "feat: document templates service (CRUD, versioning, generation)"
```

---

### Task 5: Templates and generated-documents routes

**Files:**
- Create: `apps/api/src/routes/templates.ts`
- Create: `apps/api/src/routes/documents.ts`
- Modify: `apps/api/src/routes/index.ts` — register both routers
- Test: `apps/api/src/__tests__/templates.test.ts` (extend with route-level tests)

**Interfaces:**
- Consumes: everything from `apps/api/src/services/templates.ts` (Task 4)
- Consumes: `userCanAccessClient(userId, clientId)`, `userCanAccessMatter(userId, matterId)` from `./clients.js` / `./matters.js` — existing functions, reused here to enforce "generate requires the same read access as viewing"
- Produces: `templatesRouter` mounted at `/api/templates`, `documentsRouter` mounted at `/api/documents`

- [ ] **Step 1: Create `apps/api/src/routes/templates.ts`**

```typescript
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import type { Request, Response, NextFunction } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { createError } from '../middleware/errorHandler.js'
import { hasPermission } from '@hakios/types'
import * as templatesService from '../services/templates.js'
import { userCanAccessClient } from '../services/clients.js'
import { userCanAccessMatter } from '../services/matters.js'

export const templatesRouter = Router()

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const templateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === DOCX_MIME),
})

function handleTemplateUpload(req: Request, res: Response, next: NextFunction): void {
  templateUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(createError('This file is too large. Please upload a file smaller than 15MB.', 400, 'FILE_TOO_LARGE'))
    }
    if (err) return next(err)
    next()
  })
}

templatesRouter.get('/', requireAuth, requireRole('templates:use'), async (req, res, next) => {
  try {
    const category = typeof req.query['category'] === 'string' ? req.query['category'] : undefined
    const templates = await templatesService.listTemplates(category)
    res.json(templates)
  } catch (err) {
    next(err)
  }
})

templatesRouter.get('/:id', requireAuth, requireRole('templates:use'), async (req, res, next) => {
  try {
    const detail = await templatesService.getTemplateDetail(req.params['id']!)
    if (!detail) return next(createError('We couldn’t find that template. It may have been deleted.', 404, 'NOT_FOUND'))
    res.json(detail)
  } catch (err) {
    next(err)
  }
})

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Please enter a name for the template.').max(200),
  category: z.string().min(1, 'Please choose a category for the template.').max(100),
})

templatesRouter.post(
  '/',
  requireAuth,
  requireRole('templates:manage'),
  handleTemplateUpload,
  async (req, res, next) => {
    try {
      if (!req.file) {
        return next(createError('Please upload a Word document (.docx file).', 400, 'VALIDATION_ERROR'))
      }
      const result = createTemplateSchema.safeParse(req.body)
      if (!result.success) {
        return next(createError(result.error.errors[0]?.message ?? 'Please check the template details and try again.', 400, 'VALIDATION_ERROR'))
      }
      const template = await templatesService.createTemplate({
        name: result.data.name,
        category: result.data.category,
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        userId: req.user!.id,
      })
      res.status(201).json(template)
    } catch (err) {
      next(err)
    }
  },
)

const addVersionSchema = z.object({
  changeNote: z.string().min(1, 'You need to add a note describing what you changed before saving the template.').max(1000),
})

templatesRouter.post(
  '/:id/versions',
  requireAuth,
  requireRole('templates:manage'),
  handleTemplateUpload,
  async (req, res, next) => {
    try {
      if (!req.file) {
        return next(createError('Please upload a Word document (.docx file).', 400, 'VALIDATION_ERROR'))
      }
      const result = addVersionSchema.safeParse(req.body)
      if (!result.success) {
        return next(createError(result.error.errors[0]?.message ?? 'Please add a note describing what you changed.', 400, 'VALIDATION_ERROR'))
      }
      const version = await templatesService.addTemplateVersion(req.params['id']!, {
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        changeNote: result.data.changeNote,
        userId: req.user!.id,
      })
      res.status(201).json(version)
    } catch (err) {
      next(err)
    }
  },
)

templatesRouter.delete('/:id', requireAuth, requireRole('templates:manage'), async (req, res, next) => {
  try {
    const deleted = await templatesService.deleteTemplate(req.params['id']!)
    if (!deleted) return next(createError('We couldn’t find that template. It may already have been deleted.', 404, 'NOT_FOUND'))
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

templatesRouter.get(
  '/:id/versions/:versionId/download',
  requireAuth,
  requireRole('templates:use'),
  async (req, res, next) => {
    try {
      const downloadUrl = await templatesService.getTemplateVersionDownloadUrl(
        req.params['id']!,
        req.params['versionId']!,
      )
      if (!downloadUrl) return next(createError('We couldn’t find that file.', 404, 'NOT_FOUND'))
      res.json({ downloadUrl })
    } catch (err) {
      next(err)
    }
  },
)

const generateSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    matterId: z.string().uuid().optional(),
  })
  .refine((data) => Boolean(data.clientId) !== Boolean(data.matterId), {
    message: 'Please choose a client or a matter before creating the document.',
  })

templatesRouter.post('/:id/generate', requireAuth, requireRole('templates:use'), async (req, res, next) => {
  try {
    const result = generateSchema.safeParse(req.body)
    if (!result.success) {
      return next(createError(result.error.errors[0]?.message ?? 'Please choose a client or a matter before creating the document.', 400, 'VALIDATION_ERROR'))
    }
    const { clientId, matterId } = result.data
    const canAccessAll = hasPermission(req.user!.role, 'clients:read_all')

    if (clientId && !canAccessAll) {
      const allowed = await userCanAccessClient(req.user!.id, clientId)
      if (!allowed) return next(createError('You don’t have permission to do this. Please contact your administrator.', 403, 'FORBIDDEN'))
    }
    if (matterId && !canAccessAll) {
      const allowed = await userCanAccessMatter(req.user!.id, matterId)
      if (!allowed) return next(createError('You don’t have permission to do this. Please contact your administrator.', 403, 'FORBIDDEN'))
    }

    const outcome = await templatesService.generateDocument({
      templateId: req.params['id']!,
      clientId,
      matterId,
      userId: req.user!.id,
    })
    res.status(201).json(outcome)
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 2: Create `apps/api/src/routes/documents.ts`**

```typescript
import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { createError } from '../middleware/errorHandler.js'
import * as templatesService from '../services/templates.js'

export const documentsRouter = Router()

documentsRouter.get('/generated', requireAuth, requireRole('templates:use'), async (req, res, next) => {
  try {
    const clientId = typeof req.query['clientId'] === 'string' ? req.query['clientId'] : undefined
    const matterId = typeof req.query['matterId'] === 'string' ? req.query['matterId'] : undefined
    const documents = await templatesService.listGeneratedDocuments({ clientId, matterId })
    res.json(documents)
  } catch (err) {
    next(err)
  }
})

documentsRouter.get(
  '/generated/:id/download',
  requireAuth,
  requireRole('templates:use'),
  async (req, res, next) => {
    try {
      const downloadUrl = await templatesService.getGeneratedDocumentDownloadUrl(req.params['id']!)
      if (!downloadUrl) return next(createError('We couldn’t find that document.', 404, 'NOT_FOUND'))
      res.json({ downloadUrl })
    } catch (err) {
      next(err)
    }
  },
)
```

- [ ] **Step 3: Register both routers**

In `apps/api/src/routes/index.ts`, add the imports and `app.use` calls:

```typescript
import type { Express } from 'express'
import { authRouter } from './auth.js'
import { pushRouter } from './push.js'
import { clientsRouter } from './clients.js'
import { mattersRouter } from './matters.js'
import { usersRouter } from './users.js'
import { setupRouter } from './setup.js'
import { settingsRouter } from './settings.js'
import { calendarRouter } from './calendar.js'
import { notificationsRouter } from './notifications.js'
import { cronRouter } from './cron.js'
import { templatesRouter } from './templates.js'
import { documentsRouter } from './documents.js'

export function registerRoutes(app: Express): void {
  app.use('/api/auth', authRouter)
  app.use('/api/push', pushRouter)
  app.use('/api/clients', clientsRouter)
  app.use('/api/matters', mattersRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/setup', setupRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api/calendar', calendarRouter)
  app.use('/api/notifications', notificationsRouter)
  app.use('/api/cron', cronRouter)
  app.use('/api/templates', templatesRouter)
  app.use('/api/documents', documentsRouter)
}
```

- [ ] **Step 4: Write the failing route tests**

Append to `apps/api/src/__tests__/templates.test.ts` (needs `request` and `createApp` imports added at the top, alongside the existing ones — add `import request from 'supertest'` and `import { createApp } from '../app.js'` and `const app = createApp()` near the top of the file if not already present from Task 4):

```typescript
describe('template routes permissions', () => {
  it('returns 403 for a clerk trying to create a template', async () => {
    const hash = await hashPassword('Test@1234!')
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ('clerk-tmpl@test.com', $1, 'Clerk', 'Tester', 'clerk')
       ON CONFLICT (email) DO UPDATE SET password_hash = $1 RETURNING id`,
      [hash],
    )
    const { signAccessToken } = await import('../lib/jwt.js')
    const clerkToken = signAccessToken(rows[0]!.id, 'clerk')

    const res = await request(app)
      .post('/api/templates')
      .set('Authorization', `Bearer ${clerkToken}`)
      .field('name', 'Should Fail')
      .field('category', 'NDA')
      .attach('file', readFileSync(FIXTURE_PATH), 'sample-template.docx')

    expect(res.status).toBe(403)
    await db.query("DELETE FROM users WHERE email = 'clerk-tmpl@test.com'")
  })

  it('allows a clerk to list templates (templates:use)', async () => {
    const hash = await hashPassword('Test@1234!')
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ('clerk-tmpl2@test.com', $1, 'Clerk', 'Tester', 'clerk')
       ON CONFLICT (email) DO UPDATE SET password_hash = $1 RETURNING id`,
      [hash],
    )
    const { signAccessToken } = await import('../lib/jwt.js')
    const clerkToken = signAccessToken(rows[0]!.id, 'clerk')

    const res = await request(app)
      .get('/api/templates')
      .set('Authorization', `Bearer ${clerkToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    await db.query("DELETE FROM users WHERE email = 'clerk-tmpl2@test.com'")
  })
})

describe('POST /api/templates/:id/generate validation', () => {
  it('rejects a request with neither clientId nor matterId', async () => {
    const fileBuffer = readFileSync(FIXTURE_PATH)
    const template = await templatesService.createTemplate({
      name: 'Validation Test Template',
      category: 'NDA',
      fileBuffer,
      fileName: 'sample-template.docx',
      userId: adminId,
    })
    const { signAccessToken } = await import('../lib/jwt.js')
    const token = signAccessToken(adminId, 'partner')

    const res = await request(app)
      .post(`/api/templates/${template.id}/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Please choose a client or a matter before creating the document.')
  })
})
```

- [ ] **Step 5: Run tests to confirm they fail**

```bash
cd apps/api && npm run test -- templates
```

Expected: route-not-found or import errors, since `templates.ts`/`documents.ts` routes don't exist yet.

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd apps/api && npm run test -- templates
```

Expected: PASS.

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/templates.ts apps/api/src/routes/documents.ts apps/api/src/routes/index.ts apps/api/src/__tests__/templates.test.ts
git commit -m "feat: templates and generated-documents API routes"
```

---

### Task 6: Frontend FormData support and template library pages

**Files:**
- Modify: `apps/web/src/lib/api.ts` — support `FormData` bodies
- Create: `apps/web/src/pages/templates/TemplatesLibraryPage.tsx`
- Create: `apps/web/src/pages/templates/CreateTemplatePage.tsx`
- Create: `apps/web/src/pages/templates/TemplateDetailPage.tsx`
- Modify: `apps/web/src/router.tsx` — add `/templates`, `/templates/new`, `/templates/:id`
- Modify: `apps/web/src/components/Layout.tsx` — add "Templates" nav item

**Interfaces:**
- Consumes: `DocumentTemplate`, `DocumentTemplateDetail`, `DocumentTemplateVersion` from `@hakios/types` (Task 1); `GET/POST /api/templates`, `GET/POST /api/templates/:id`, `GET .../versions/:versionId/download` (Task 5)

- [ ] **Step 1: Add `FormData` support to the `api()` helper**

In `apps/web/src/lib/api.ts`, modify only the header-building logic in `api<T>` so it doesn't force JSON headers when the body is `FormData` (the browser sets the correct multipart boundary itself) — replace this block:

```typescript
  const token = await getValidToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
```

with:

```typescript
  const token = await getValidToken()
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
```

Leave the rest of the function (the error-fallback text below this block) untouched here — that text is updated separately by the `2026-07-02-error-message-cleanup.md` plan, which may run before or after this one.

- [ ] **Step 2: Create `TemplatesLibraryPage.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { DocumentTemplate } from '@hakios/types'
import { hasPermission } from '@hakios/types'
import { useAuthStore } from '../../store/auth'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'

export function TemplatesLibraryPage() {
  const { user } = useAuthStore()
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canManage = user ? hasPermission(user.role, 'templates:manage') : false

  useEffect(() => {
    setLoading(true)
    const query = category ? `?category=${encodeURIComponent(category)}` : ''
    api<DocumentTemplate[]>(`/templates${query}`)
      .then((data) => { setTemplates(data); setLoading(false) })
      .catch((err: Error) => { setError(err.message); setLoading(false) })
  }, [category])

  const categories = Array.from(new Set(templates.map((t) => t.category))).sort()

  return (
    <div>
      <PageHeader
        title="Document Templates"
        action={canManage ? <Link to="/templates/new" className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-4 py-2 rounded-lg transition">Upload Template</Link> : undefined}
      />
      <div className="p-4 md:p-8">
        <div className="flex gap-3 mb-6">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {loading && <p className="text-text-muted text-sm">Loading…</p>}
        {error && <p className="text-status-overdue text-sm">{error}</p>}

        {!loading && !error && templates.length === 0 && (
          <p className="text-text-muted text-sm">No templates yet.</p>
        )}

        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-background border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-text-secondary">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-text-secondary">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-text-secondary">Version</th>
                  <th className="text-left px-4 py-3 font-medium text-text-secondary">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-background">
                    <td className="px-4 py-3">
                      <Link to={`/templates/${t.id}`} className="text-primary hover:underline font-medium">{t.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{t.category}</td>
                    <td className="px-4 py-3 text-text-secondary">v{t.latestVersion}</td>
                    <td className="px-4 py-3 text-text-secondary">{new Date(t.latestVersionAt).toLocaleDateString('en-KE')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `CreateTemplatePage.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { hasPermission } from '@hakios/types'
import type { DocumentTemplate } from '@hakios/types'
import { useAuthStore } from '../../store/auth'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'

const schema = z.object({
  name: z.string().min(1, 'Please enter a name for the template.'),
  category: z.string().min(1, 'Please choose a category for the template.'),
})

type Form = z.infer<typeof schema>

const INPUT_CLASS = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const LABEL_CLASS = 'block text-sm font-medium text-text-primary mb-1'

export function CreateTemplatePage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  if (!user || !hasPermission(user.role, 'templates:manage')) {
    return <Navigate to="/templates" replace />
  }

  async function onSubmit(data: Form) {
    setServerError(null)
    setFileError(null)
    if (!file) {
      setFileError('Please upload a Word document (.docx file).')
      return
    }
    try {
      const formData = new FormData()
      formData.append('name', data.name)
      formData.append('category', data.category)
      formData.append('file', file)
      const template = await api<DocumentTemplate>('/templates', { method: 'POST', body: formData })
      navigate(`/templates/${template.id}`)
    } catch (err) {
      setServerError((err as Error).message)
    }
  }

  return (
    <div>
      <PageHeader title="Upload Template" />
      <div className="p-4 md:p-8 max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className={LABEL_CLASS}>Template name *</label>
            <input {...register('name')} className={INPUT_CLASS} placeholder="e.g. Commercial Lease Agreement" />
            {errors.name && <p className="mt-1 text-xs text-status-overdue">{errors.name.message}</p>}
          </div>

          <div>
            <label className={LABEL_CLASS}>Category *</label>
            <input {...register('category')} className={INPUT_CLASS} placeholder="e.g. Lease, NDA, Affidavit" />
            {errors.category && <p className="mt-1 text-xs text-status-overdue">{errors.category.message}</p>}
          </div>

          <div>
            <label className={LABEL_CLASS}>Word document (.docx) *</label>
            <input
              type="file"
              accept=".docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={INPUT_CLASS}
            />
            {fileError && <p className="mt-1 text-xs text-status-overdue">{fileError}</p>}
          </div>

          {serverError && <p className="text-sm text-status-overdue">{serverError}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-6 py-2.5 rounded-lg transition disabled:opacity-60"
            >
              {isSubmitting ? 'Uploading…' : 'Upload template'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="border border-border text-text-secondary text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-background transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `TemplateDetailPage.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { hasPermission } from '@hakios/types'
import type { DocumentTemplateDetail } from '@hakios/types'
import { useAuthStore } from '../../store/auth'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'

const INPUT_CLASS = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const LABEL_CLASS = 'block text-sm font-medium text-text-primary mb-1'

export function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const [template, setTemplate] = useState<DocumentTemplateDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [changeNote, setChangeNote] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const canManage = user ? hasPermission(user.role, 'templates:manage') : false

  function load() {
    if (!id) return
    api<DocumentTemplateDetail>(`/templates/${id}`)
      .then(setTemplate)
      .catch((err: Error) => setError(err.message))
  }

  useEffect(load, [id])

  async function handleDownload(versionId: string) {
    if (!id) return
    const { downloadUrl } = await api<{ downloadUrl: string }>(`/templates/${id}/versions/${versionId}/download`)
    window.open(downloadUrl, '_blank')
  }

  async function handleUploadVersion(e: React.FormEvent) {
    e.preventDefault()
    setUploadError(null)
    if (!file) {
      setUploadError('Please upload a Word document (.docx file).')
      return
    }
    if (!changeNote.trim()) {
      setUploadError('You need to add a note describing what you changed before saving the template.')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('changeNote', changeNote)
      await api(`/templates/${id}/versions`, { method: 'POST', body: formData })
      setFile(null)
      setChangeNote('')
      load()
    } catch (err) {
      setUploadError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  if (error) return <div className="p-8 text-status-overdue text-sm">{error}</div>
  if (!template) return <div className="p-8 text-text-muted text-sm">Loading…</div>

  return (
    <div>
      <PageHeader title={template.name} />
      <div className="p-4 md:p-8 max-w-3xl space-y-8">
        <section>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Details</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs text-text-muted">Category</dt>
              <dd className="text-sm text-text-primary mt-0.5">{template.category}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Current version</dt>
              <dd className="text-sm text-text-primary mt-0.5">v{template.latestVersion}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Version history</h2>
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-background border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-text-secondary">Version</th>
                    <th className="text-left px-4 py-2 font-medium text-text-secondary">Change note</th>
                    <th className="text-left px-4 py-2 font-medium text-text-secondary">Date</th>
                    <th className="text-left px-4 py-2 font-medium text-text-secondary"></th>
                  </tr>
                </thead>
                <tbody>
                  {template.versions.map((v) => (
                    <tr key={v.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">v{v.versionNumber}</td>
                      <td className="px-4 py-2 text-text-secondary">{v.changeNote}</td>
                      <td className="px-4 py-2 text-text-secondary">{new Date(v.createdAt).toLocaleDateString('en-KE')}</td>
                      <td className="px-4 py-2">
                        <button onClick={() => handleDownload(v.id)} className="text-primary hover:underline text-xs">Download</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {canManage && (
          <section>
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Upload new version</h2>
            <form onSubmit={handleUploadVersion} className="space-y-4 max-w-md">
              <div>
                <label className={LABEL_CLASS}>Word document (.docx) *</label>
                <input
                  type="file"
                  accept=".docx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>What changed? *</label>
                <textarea
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. Updated clause 5 per new rent law"
                  className={INPUT_CLASS}
                />
              </div>
              {uploadError && <p className="text-sm text-status-overdue">{uploadError}</p>}
              <button
                type="submit"
                disabled={uploading}
                className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-6 py-2.5 rounded-lg transition disabled:opacity-60"
              >
                {uploading ? 'Saving…' : 'Save new version'}
              </button>
            </form>
          </section>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Wire up routes**

In `apps/web/src/router.tsx`, replace this import line:

```tsx
import { NotificationsPage } from './pages/notifications/NotificationsPage'
```

with:

```tsx
import { NotificationsPage } from './pages/notifications/NotificationsPage'
import { TemplatesLibraryPage } from './pages/templates/TemplatesLibraryPage'
import { CreateTemplatePage } from './pages/templates/CreateTemplatePage'
import { TemplateDetailPage } from './pages/templates/TemplateDetailPage'
```

And replace this route entry:

```tsx
      { path: 'notifications', element: <NotificationsPage /> },
```

with:

```tsx
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'templates', element: <TemplatesLibraryPage /> },
      { path: 'templates/new', element: <CreateTemplatePage /> },
      { path: 'templates/:id', element: <TemplateDetailPage /> },
```

- [ ] **Step 6: Add the nav item**

In `apps/web/src/components/Layout.tsx`, add `{ to: '/templates', label: 'Templates' }` to `NAV_ITEMS`, visible to everyone (same as Calendar):

```tsx
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/clients', label: 'Clients' },
  { to: '/matters', label: 'Matters' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/templates', label: 'Templates' },
  ...(canManageUsers ? [{ to: '/users', label: 'Users' }] : []),
  ...(canManageSettings ? [{ to: '/settings', label: 'Settings' }] : []),
]
```

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck --workspace=apps/web
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/pages/templates apps/web/src/router.tsx apps/web/src/components/Layout.tsx
git commit -m "feat: template library, upload, and version-history pages"
```

---

### Task 7: Generate-document flow on client and matter detail pages

**Files:**
- Create: `apps/web/src/components/GeneratedDocumentsSection.tsx`
- Create: `apps/web/src/pages/templates/GenerateDocumentPage.tsx`
- Modify: `apps/web/src/pages/clients/ClientDetailPage.tsx` — add the Documents section
- Modify: `apps/web/src/pages/matters/MatterDetailPage.tsx` — add the Documents section
- Modify: `apps/web/src/router.tsx` — add `/clients/:clientId/generate` and `/matters/:matterId/generate`

**Interfaces:**
- Consumes: `GeneratedDocument`, `DocumentTemplate`, `GenerateDocumentResult` from `@hakios/types`; `GET /api/documents/generated`, `POST /api/templates/:id/generate` (Task 5)
- Produces: `<GeneratedDocumentsSection clientId? matterId? />` — reusable component consumed by both detail pages

- [ ] **Step 1: Create the reusable `GeneratedDocumentsSection`**

```tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { GeneratedDocument } from '@hakios/types'
import { api } from '../lib/api'

interface Props {
  clientId?: string
  matterId?: string
}

export function GeneratedDocumentsSection({ clientId, matterId }: Props) {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<GeneratedDocument[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const query = clientId ? `clientId=${clientId}` : `matterId=${matterId}`
    api<GeneratedDocument[]>(`/documents/generated?${query}`)
      .then(setDocuments)
      .catch((err: Error) => setError(err.message))
  }, [clientId, matterId])

  async function handleDownload(id: string) {
    const { downloadUrl } = await api<{ downloadUrl: string }>(`/documents/generated/${id}/download`)
    window.open(downloadUrl, '_blank')
  }

  function handleGenerate() {
    const query = clientId ? `clientId=${clientId}` : `matterId=${matterId}`
    navigate(`/documents/generate?${query}`)
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Documents</h2>
        <button onClick={handleGenerate} className="text-sm text-primary hover:underline">Generate Document</button>
      </div>
      {error && <p className="text-status-overdue text-sm">{error}</p>}
      {!error && documents.length === 0 && <p className="text-text-muted text-sm">No documents generated yet.</p>}
      {documents.length > 0 && (
        <ul className="space-y-2">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between border border-border rounded-lg px-4 py-2 text-sm">
              <div>
                <p className="text-text-primary font-medium">{d.fileName}</p>
                <p className="text-text-muted text-xs">
                  {d.templateName} · {new Date(d.generatedAt).toLocaleDateString('en-KE')}
                </p>
              </div>
              <button onClick={() => handleDownload(d.id)} className="text-primary hover:underline text-xs">Download</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Create `GenerateDocumentPage.tsx`**

Mounted at a single shared route (`/documents/generate?clientId=` or `?matterId=`), since the generation step itself doesn't depend on which detail page it was launched from:

```tsx
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { DocumentTemplate, GenerateDocumentResult } from '@hakios/types'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'

export function GenerateDocumentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const clientId = searchParams.get('clientId') ?? undefined
  const matterId = searchParams.get('matterId') ?? undefined

  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    api<DocumentTemplate[]>('/templates').then(setTemplates).catch((err: Error) => setError(err.message))
  }, [])

  const categories = Array.from(new Set(templates.map((t) => t.category))).sort()

  async function handleGenerate() {
    setError(null)
    setWarnings([])
    if (!templateId) {
      setError('Please choose a template before creating the document.')
      return
    }
    setGenerating(true)
    try {
      const result = await api<GenerateDocumentResult>(`/templates/${templateId}/generate`, {
        method: 'POST',
        body: JSON.stringify(clientId ? { clientId } : { matterId }),
      })
      window.open(result.downloadUrl, '_blank')
      setWarnings(result.warnings)
      if (result.warnings.length === 0) {
        navigate(clientId ? `/clients/${clientId}` : `/matters/${matterId}`)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <PageHeader title="Generate Document" />
      <div className="p-4 md:p-8 max-w-xl space-y-5">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Template *</label>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Select a template…</option>
            {categories.map((category) => (
              <optgroup key={category} label={category}>
                {templates.filter((t) => t.category === category).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-status-overdue">{error}</p>}
        {warnings.map((w, i) => (
          <p key={i} className="text-sm text-status-overdue">{w}</p>
        ))}

        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-6 py-2.5 rounded-lg transition disabled:opacity-60"
          >
            {generating ? 'Creating…' : 'Create document'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="border border-border text-text-secondary text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-background transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add the Documents section to `ClientDetailPage.tsx`**

In `apps/web/src/pages/clients/ClientDetailPage.tsx`, add the import:

```tsx
import { GeneratedDocumentsSection } from '../../components/GeneratedDocumentsSection'
```

And insert `<GeneratedDocumentsSection clientId={client.id} />` between the conditional "Notes" section and the "View matters for this client" link — i.e. replace this:

```tsx
        <div>
          <Link
            to={`/matters?clientId=${client.id}`}
            className="text-sm text-primary hover:underline"
          >
            View matters for this client →
          </Link>
        </div>
```

with this:

```tsx
        <GeneratedDocumentsSection clientId={client.id} />

        <div>
          <Link
            to={`/matters?clientId=${client.id}`}
            className="text-sm text-primary hover:underline"
          >
            View matters for this client →
          </Link>
        </div>
```

- [ ] **Step 4: Add the Documents section to `MatterDetailPage.tsx`**

In `apps/web/src/pages/matters/MatterDetailPage.tsx`, add the same import:

```tsx
import { GeneratedDocumentsSection } from '../../components/GeneratedDocumentsSection'
```

And insert `<GeneratedDocumentsSection matterId={matter.id} />` between the last conditional `<section>` block and the "View client record" link `<div>` — i.e. replace this:

```tsx
        <div>
          <Link
            to={`/clients/${matter.clientId}`}
            className="text-sm text-primary hover:underline"
          >
            ← View client record
          </Link>
        </div>
```

with this:

```tsx
        <GeneratedDocumentsSection matterId={matter.id} />

        <div>
          <Link
            to={`/clients/${matter.clientId}`}
            className="text-sm text-primary hover:underline"
          >
            ← View client record
          </Link>
        </div>
```

- [ ] **Step 5: Wire up the generate route**

In `apps/web/src/router.tsx`, replace this import line (added in Task 6, Step 5):

```tsx
import { TemplateDetailPage } from './pages/templates/TemplateDetailPage'
```

with:

```tsx
import { TemplateDetailPage } from './pages/templates/TemplateDetailPage'
import { GenerateDocumentPage } from './pages/templates/GenerateDocumentPage'
```

And replace this route entry (added in Task 6, Step 5):

```tsx
      { path: 'templates/:id', element: <TemplateDetailPage /> },
```

with:

```tsx
      { path: 'templates/:id', element: <TemplateDetailPage /> },
      { path: 'documents/generate', element: <GenerateDocumentPage /> },
```

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck --workspace=apps/web
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/GeneratedDocumentsSection.tsx apps/web/src/pages/templates/GenerateDocumentPage.tsx apps/web/src/pages/clients/ClientDetailPage.tsx apps/web/src/pages/matters/MatterDetailPage.tsx apps/web/src/router.tsx
git commit -m "feat: generate-document flow from client and matter detail pages"
```

---

### Task 8: Firm logo upload in Settings

**Files:**
- Modify: `apps/web/src/pages/settings/SettingsPage.tsx` — add a Branding section

**Interfaces:**
- Consumes: `POST /api/settings/logo`, `DELETE /api/settings/logo`, `GET /api/settings/logo` (Task 3)

- [ ] **Step 1: Read the current Firm Profile section**

Open `apps/web/src/pages/settings/SettingsPage.tsx` and find the "Firm Profile" `<section>` block (it renders `firmForm` fields for name/address/phone/email). The Branding section goes immediately after it, as its own `<section>`, using the same heading style (`<h2 className="text-sm font-semibold text-text-primary mb-4">`).

- [ ] **Step 2: Add logo state and handlers**

Near the top of the `SettingsPage` component function, alongside the existing `useState` calls for the other settings sections, add:

```tsx
const [logoUrl, setLogoUrl] = useState<string | null>(null)
const [logoFile, setLogoFile] = useState<File | null>(null)
const [logoError, setLogoError] = useState<string | null>(null)
const [logoUploading, setLogoUploading] = useState(false)

useEffect(() => {
  api<{ downloadUrl: string | null }>('/settings/logo')
    .then((r) => setLogoUrl(r.downloadUrl))
    .catch(() => {})
}, [])

async function handleLogoUpload() {
  setLogoError(null)
  if (!logoFile) {
    setLogoError('Please upload a PNG or JPEG image.')
    return
  }
  setLogoUploading(true)
  try {
    const formData = new FormData()
    formData.append('file', logoFile)
    await api('/settings/logo', { method: 'POST', body: formData })
    const r = await api<{ downloadUrl: string | null }>('/settings/logo')
    setLogoUrl(r.downloadUrl)
    setLogoFile(null)
  } catch (err) {
    setLogoError((err as Error).message)
  } finally {
    setLogoUploading(false)
  }
}

async function handleLogoRemove() {
  setLogoError(null)
  try {
    await api('/settings/logo', { method: 'DELETE' })
    setLogoUrl(null)
  } catch (err) {
    setLogoError((err as Error).message)
  }
}
```

(`useEffect` and `api` are already imported at the top of this file for the other settings sections — no new imports needed beyond confirming those two are present.)

- [ ] **Step 3: Add the Branding section JSX**

Immediately after the closing `</section>` of the Firm Profile block, add:

```tsx
<section>
  <h2 className="text-sm font-semibold text-text-primary mb-4">Branding</h2>
  <p className="text-sm text-text-secondary mb-4">
    This logo appears on documents generated from templates that include a logo placeholder.
  </p>
  {logoUrl && (
    <img src={logoUrl} alt="Firm logo" className="h-16 w-auto mb-4 border border-border rounded-lg p-2" />
  )}
  <div className="flex items-center gap-3">
    <input
      type="file"
      accept="image/png,image/jpeg"
      onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
      className="text-sm"
    />
    <button
      onClick={handleLogoUpload}
      disabled={logoUploading}
      className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-60"
    >
      {logoUploading ? 'Uploading…' : 'Upload logo'}
    </button>
    {logoUrl && (
      <button
        onClick={handleLogoRemove}
        className="border border-border text-text-secondary text-sm font-medium px-4 py-2 rounded-lg hover:bg-background transition"
      >
        Remove
      </button>
    )}
  </div>
  {logoError && <p className="mt-2 text-sm text-status-overdue">{logoError}</p>}
</section>
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck --workspace=apps/web
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/settings/SettingsPage.tsx
git commit -m "feat: firm logo upload in Settings"
```

---

### Task 9: End-to-end verification

**Files:** none — this task is verification only.

- [ ] **Step 1: Run the full API test suite**

```bash
npm run test --workspace=apps/api
```

Expected: all tests pass, given live DB + R2 credentials (Render environment, or a fully configured local `.env`).

- [ ] **Step 2: Run full typecheck across the monorepo**

```bash
npm run typecheck
```

Expected: 0 errors across `@hakios/types`, `apps/api`, `apps/web`.

- [ ] **Step 3: Manually verify the flow in the browser**

Using the `/run` skill or `npm run dev`, log in as a partner/admin and walk through: upload a template with a `{{client_name}}` placeholder → open a client → click "Generate Document" → select the template → confirm a `.docx` downloads and contains the client's name filled in → confirm the document now appears in that client's Documents list. Then upload a firm logo in Settings, add a `{%firm_logo}` tag to a template, and regenerate to confirm the logo appears in the output file.

- [ ] **Step 4: Confirm mobile responsiveness**

Resize the browser (or use device emulation) to a phone width and check `/templates`, the template detail page, and the generate-document page — these were built using the same responsive patterns (`p-4 md:p-8`, `overflow-x-auto` tables, `grid-cols-1 md:grid-cols-2`) as the rest of the app, so no extra work should be needed, but confirm visually.
