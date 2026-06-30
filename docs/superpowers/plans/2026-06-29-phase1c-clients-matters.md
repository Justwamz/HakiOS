# Phase 1c — Clients & Matters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build full CRUD for Clients and Matters with RBAC enforcement, audit logging, case-number generation, and React pages with sidebar navigation.

**Architecture:** Three layers per feature — Express service (DB logic), Express router (HTTP + auth), React pages. Audit log written after every mutation. Matter numbers generated atomically from `matter_sequences` + `settings.case_number` config. Web pages use the `api()` helper from `lib/api.ts`.

**Tech Stack:** Node.js + Express 4, PostgreSQL via `pg`, Zod validation, React 18 + react-hook-form + Zod, react-router-dom v6, Tailwind CSS, Vitest + Supertest.

## Global Constraints

- TypeScript 5 strict mode + `noUncheckedIndexedAccess: true` — no `any`, no `!` unless a row is proven non-null by a `if (!rows[0])` guard.
- JWT in `Authorization: Bearer` header; never in URL or cookie.
- Passwords never in logs; secrets always from `process.env`.
- bcrypt minimum 12 salt rounds (no new hashing here, but don't break the rule).
- Use `.safeParse()` on all incoming HTTP bodies/queries; return `createError('Invalid ...', 400)` on failure — never let Zod throw.
- Audit log entry written for every CREATE, UPDATE, CLOSE mutation.
- RBAC enforced at route layer using `requireRole()` or inline `hasPermission()` check.
- Exact Tailwind classes from `tailwind.config.ts`: `bg-primary`, `bg-primary-light`, `bg-background`, `bg-surface`, `border-border`, `text-primary`, `text-text-primary`, `text-text-secondary`, `text-text-muted`, `text-status-overdue`, `text-status-urgent`, `text-status-upcoming`.
- No comments except where WHY is non-obvious.
- `npm run build` and `npm run typecheck` must pass before each commit.

---

### Task 1c.1: Audit Helper + Clients API

**Files:**
- Create: `apps/api/src/lib/audit.ts`
- Create: `apps/api/src/services/clients.ts`
- Create: `apps/api/src/routes/clients.ts`
- Modify: `apps/api/src/routes/index.ts`
- Create: `apps/api/src/__tests__/clients.test.ts`

**Interfaces:**
- Produces: `writeAuditLog(params)` — used by all mutation routes in Tasks 1c.1 and 1c.2.
- Produces: `GET /clients`, `POST /clients`, `GET /clients/:id`, `PUT /clients/:id` — consumed by Task 1c.4 web pages.
- Produces: `PaginatedResult<T>` interface — reused by matters service in Task 1c.2.

---

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/__tests__/clients.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { db } from '../db/client.js'
import { hashPassword } from '../lib/password.js'
import { signAccessToken } from '../lib/jwt.js'

const app = createApp()
let adminId: string
let clerkId: string
let adminToken: string
let clerkToken: string
let createdClientId: string

beforeAll(async () => {
  const hash = await hashPassword('Test@1234!')
  const { rows: a } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ('admin@clients.test', $1, 'Admin', 'CTest', 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1 RETURNING id`,
    [hash],
  )
  adminId = a[0]!.id
  adminToken = signAccessToken(adminId, 'admin')

  const { rows: c } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ('clerk@clients.test', $1, 'Clerk', 'CTest', 'clerk')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1 RETURNING id`,
    [hash],
  )
  clerkId = c[0]!.id
  clerkToken = signAccessToken(clerkId, 'clerk')
})

afterAll(async () => {
  if (createdClientId) await db.query('DELETE FROM clients WHERE id = $1', [createdClientId])
  await db.query("DELETE FROM users WHERE email IN ('admin@clients.test','clerk@clients.test')")
  await db.end()
})

describe('POST /clients', () => {
  it('creates a client and returns 201 for admin', async () => {
    const res = await request(app)
      .post('/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientType: 'individual', fullName: 'Jane Doe', phone: '+254700000001' })
    expect(res.status).toBe(201)
    expect(res.body.clientId).toMatch(/^CLT-\d{4}-\d{5}$/)
    expect(res.body.fullName).toBe('Jane Doe')
    createdClientId = res.body.id as string
  })

  it('returns 403 for clerk', async () => {
    const res = await request(app)
      .post('/clients')
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ clientType: 'individual', fullName: 'Nope' })
    expect(res.status).toBe(403)
  })

  it('returns 400 for missing fullName', async () => {
    const res = await request(app)
      .post('/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientType: 'individual' })
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/clients')
      .send({ clientType: 'individual', fullName: 'Test' })
    expect(res.status).toBe(401)
  })
})

describe('GET /clients', () => {
  it('returns paginated list with items and total for admin', async () => {
    const res = await request(app)
      .get('/clients')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
    expect(typeof res.body.total).toBe('number')
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/clients')
    expect(res.status).toBe(401)
  })
})

describe('GET /clients/:id', () => {
  it('returns client for admin', async () => {
    const res = await request(app)
      .get(`/clients/${createdClientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(createdClientId)
  })

  it('returns 404 for unknown UUID', async () => {
    const res = await request(app)
      .get('/clients/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })
})

describe('PUT /clients/:id', () => {
  it('updates client for admin and returns 200', async () => {
    const res = await request(app)
      .put(`/clients/${createdClientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fullName: 'Jane Doe Updated', status: 'dormant' })
    expect(res.status).toBe(200)
    expect(res.body.fullName).toBe('Jane Doe Updated')
    expect(res.body.status).toBe('dormant')
  })

  it('returns 403 for clerk', async () => {
    const res = await request(app)
      .put(`/clients/${createdClientId}`)
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ fullName: 'Hack' })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd apps/api && npm test -- clients
```
Expected: FAIL — `Cannot find module '../services/clients.js'` or `404`.

- [ ] **Step 3: Create the audit helper**

Create `apps/api/src/lib/audit.ts`:

```typescript
import { db } from '../db/client.js'

interface AuditParams {
  userId: string
  action: string
  recordType: string
  recordId: string
  beforeValue?: unknown
  afterValue?: unknown
}

export async function writeAuditLog(params: AuditParams): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (user_id, action, record_type, record_id, before_value, after_value)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.userId,
      params.action,
      params.recordType,
      params.recordId,
      params.beforeValue !== undefined ? JSON.stringify(params.beforeValue) : null,
      params.afterValue !== undefined ? JSON.stringify(params.afterValue) : null,
    ],
  )
}
```

- [ ] **Step 4: Create the clients service**

Create `apps/api/src/services/clients.ts`:

```typescript
import { db } from '../db/client.js'
import type { PoolClient } from 'pg'
import { generateClientId } from '@hakios/utils'
import type { Client, ClientStatus, CreateClientInput, UpdateClientInput } from '@hakios/types'
import { createError } from '../middleware/errorHandler.js'

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

export interface ListClientsOptions {
  search?: string
  status?: ClientStatus
  page: number
  limit: number
  userId: string
  canReadAll: boolean
}

function toClient(row: Record<string, unknown>): Client {
  return {
    id: row['id'] as string,
    clientId: row['client_id'] as string,
    clientType: row['client_type'] as Client['clientType'],
    fullName: row['full_name'] as string,
    idNumber: (row['id_number'] as string | null) ?? null,
    contactPerson: (row['contact_person'] as string | null) ?? null,
    phone: (row['phone'] as string | null) ?? null,
    email: (row['email'] as string | null) ?? null,
    postalAddress: (row['postal_address'] as string | null) ?? null,
    kraPin: (row['kra_pin'] as string | null) ?? null,
    status: row['status'] as Client['status'],
    hasConflict: row['has_conflict'] as boolean,
    conflictNotes: (row['conflict_notes'] as string | null) ?? null,
    internalNotes: (row['internal_notes'] as string | null) ?? null,
    createdBy: row['created_by'] as string,
    updatedBy: row['updated_by'] as string,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  }
}

async function nextClientSeq(year: number, pgClient: PoolClient): Promise<number> {
  const { rows } = await pgClient.query<{ seq: number }>(
    `INSERT INTO client_sequences (year, next_val)
     VALUES ($1, 2)
     ON CONFLICT (year) DO UPDATE SET next_val = client_sequences.next_val + 1
     RETURNING next_val - 1 AS seq`,
    [year],
  )
  return rows[0]!.seq
}

export async function listClients(opts: ListClientsOptions): Promise<PaginatedResult<Client>> {
  const conditions: string[] = []
  const vals: unknown[] = []
  let i = 1

  if (!opts.canReadAll) {
    conditions.push(`id IN (
      SELECT DISTINCT client_id FROM matters
      WHERE lead_advocate_id = $${i}
         OR supervising_partner_id = $${i}
         OR id IN (SELECT matter_id FROM matter_clerks WHERE user_id = $${i})
    )`)
    vals.push(opts.userId)
    i++
  }

  if (opts.search) {
    conditions.push(`(full_name ILIKE $${i} OR client_id ILIKE $${i})`)
    vals.push(`%${opts.search}%`)
    i++
  }

  if (opts.status) {
    conditions.push(`status = $${i}`)
    vals.push(opts.status)
    i++
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (opts.page - 1) * opts.limit

  const [countRes, rowsRes] = await Promise.all([
    db.query<{ total: string }>(`SELECT COUNT(*) AS total FROM clients ${where}`, vals),
    db.query(
      `SELECT * FROM clients ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...vals, opts.limit, offset],
    ),
  ])

  return {
    items: rowsRes.rows.map(toClient),
    total: parseInt(countRes.rows[0]!.total, 10),
    page: opts.page,
    limit: opts.limit,
  }
}

export async function getClient(id: string): Promise<Client> {
  const { rows } = await db.query('SELECT * FROM clients WHERE id = $1', [id])
  if (!rows[0]) throw createError('Client not found', 404, 'NOT_FOUND')
  return toClient(rows[0])
}

export async function userCanAccessClient(userId: string, clientId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM matters
     WHERE client_id = $1
       AND (lead_advocate_id = $2 OR supervising_partner_id = $2
            OR id IN (SELECT matter_id FROM matter_clerks WHERE user_id = $2))
     LIMIT 1`,
    [clientId, userId],
  )
  return rows.length > 0
}

export async function createClient(input: CreateClientInput, userId: string): Promise<Client> {
  const year = new Date().getFullYear()
  const pgClient = await db.connect()
  try {
    await pgClient.query('BEGIN')
    const seq = await nextClientSeq(year, pgClient)
    const clientId = generateClientId(year, seq)
    const { rows } = await pgClient.query(
      `INSERT INTO clients (
        client_id, client_type, full_name, id_number, contact_person,
        phone, email, postal_address, kra_pin,
        has_conflict, conflict_notes, internal_notes,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
      RETURNING *`,
      [
        clientId, input.clientType, input.fullName,
        input.idNumber ?? null, input.contactPerson ?? null,
        input.phone ?? null, input.email ?? null,
        input.postalAddress ?? null, input.kraPin ?? null,
        input.hasConflict ?? false,
        input.conflictNotes ?? null, input.internalNotes ?? null,
        userId,
      ],
    )
    await pgClient.query('COMMIT')
    return toClient(rows[0]!)
  } catch (err) {
    await pgClient.query('ROLLBACK')
    throw err
  } finally {
    pgClient.release()
  }
}

export async function updateClient(
  id: string,
  input: UpdateClientInput,
  userId: string,
): Promise<Client> {
  const existing = await getClient(id)

  const fieldMap: Record<string, string> = {
    fullName: 'full_name', idNumber: 'id_number', contactPerson: 'contact_person',
    phone: 'phone', email: 'email', postalAddress: 'postal_address',
    kraPin: 'kra_pin', hasConflict: 'has_conflict',
    conflictNotes: 'conflict_notes', internalNotes: 'internal_notes', status: 'status',
  }

  const setClauses: string[] = []
  const vals: unknown[] = []
  let i = 1

  for (const [jsKey, col] of Object.entries(fieldMap)) {
    if (jsKey in input) {
      setClauses.push(`${col} = $${i}`)
      const v = input[jsKey as keyof UpdateClientInput]
      vals.push(v !== undefined ? v : null)
      i++
    }
  }

  if (setClauses.length === 0) return existing

  setClauses.push(`updated_by = $${i}`, `updated_at = now()`)
  vals.push(userId)
  i++
  vals.push(id)

  const { rows } = await db.query(
    `UPDATE clients SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  )
  return toClient(rows[0]!)
}
```

- [ ] **Step 5: Create the clients router**

Create `apps/api/src/routes/clients.ts`:

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { hasPermission } from '@hakios/types'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { createError } from '../middleware/errorHandler.js'
import * as clientsService from '../services/clients.js'
import { writeAuditLog } from '../lib/audit.js'

export const clientsRouter = Router()

const createSchema = z.object({
  clientType: z.enum(['individual', 'corporate']),
  fullName: z.string().min(1).max(255),
  idNumber: z.string().max(50).optional(),
  contactPerson: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  postalAddress: z.string().max(500).optional(),
  kraPin: z.string().max(50).optional(),
  hasConflict: z.boolean().optional(),
  conflictNotes: z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
})

const updateSchema = createSchema
  .omit({ clientType: true })
  .extend({ status: z.enum(['active', 'dormant', 'closed']).optional() })
  .partial()

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['active', 'dormant', 'closed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

clientsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!
    const canReadAll = hasPermission(user.role, 'clients:read_all')
    if (!canReadAll && !hasPermission(user.role, 'clients:read_assigned')) {
      return next(createError('Insufficient permissions', 403, 'FORBIDDEN'))
    }
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) return next(createError('Invalid query parameters', 400))
    const result = await clientsService.listClients({ ...parsed.data, userId: user.id, canReadAll })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

clientsRouter.post('/', requireAuth, requireRole('clients:create'), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return next(createError('Invalid request body', 400))
    const client = await clientsService.createClient(parsed.data, req.user!.id)
    await writeAuditLog({ userId: req.user!.id, action: 'CREATE', recordType: 'client', recordId: client.id, afterValue: client })
    res.status(201).json(client)
  } catch (err) {
    next(err)
  }
})

clientsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!
    const client = await clientsService.getClient(req.params['id']!)
    if (!hasPermission(user.role, 'clients:read_all')) {
      const ok = await clientsService.userCanAccessClient(user.id, client.id)
      if (!ok) return next(createError('Insufficient permissions', 403, 'FORBIDDEN'))
    }
    res.json(client)
  } catch (err) {
    next(err)
  }
})

clientsRouter.put('/:id', requireAuth, requireRole('clients:edit'), async (req, res, next) => {
  try {
    const before = await clientsService.getClient(req.params['id']!)
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) return next(createError('Invalid request body', 400))
    const after = await clientsService.updateClient(req.params['id']!, parsed.data, req.user!.id)
    await writeAuditLog({ userId: req.user!.id, action: 'UPDATE', recordType: 'client', recordId: after.id, beforeValue: before, afterValue: after })
    res.json(after)
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 6: Register the clients router**

Edit `apps/api/src/routes/index.ts` — full replacement:

```typescript
import type { Express } from 'express'
import { authRouter } from './auth.js'
import { pushRouter } from './push.js'
import { clientsRouter } from './clients.js'

export function registerRoutes(app: Express): void {
  app.use('/auth', authRouter)
  app.use('/push', pushRouter)
  app.use('/clients', clientsRouter)
}
```

- [ ] **Step 7: Run tests**

```
cd apps/api && npm test -- clients
```
Expected: all 9 tests PASS.

- [ ] **Step 8: Typecheck and build**

```
cd c:\Users\kenneth.wamunyu\Desktop\Wawesh\HakiOS && npm run typecheck && npm run build -- --filter=@hakios/api
```
Expected: no errors.

- [ ] **Step 9: Commit**

```
git add apps/api/src/lib/audit.ts apps/api/src/services/clients.ts apps/api/src/routes/clients.ts apps/api/src/routes/index.ts apps/api/src/__tests__/clients.test.ts
git commit -m "feat(api): add audit helper and clients CRUD"
```

---

### Task 1c.2: Matter Types Update + Matters API

**Files:**
- Modify: `packages/types/src/matter.ts` (add `UpdateMatterInput`, `CloseMatterInput`)
- Create: `apps/api/src/services/matters.ts`
- Create: `apps/api/src/routes/matters.ts`
- Create: `apps/api/src/routes/users.ts`
- Modify: `apps/api/src/routes/index.ts`
- Create: `apps/api/src/__tests__/matters.test.ts`

**Interfaces:**
- Consumes: `writeAuditLog()` from `apps/api/src/lib/audit.ts` (Task 1c.1).
- Consumes: `PaginatedResult<T>` from `apps/api/src/services/clients.ts` (Task 1c.1) — re-export the same shape.
- Produces: `GET /matters`, `POST /matters`, `GET /matters/:id`, `PUT /matters/:id`, `POST /matters/:id/close`, `GET /matters/types` — consumed by Task 1c.5.
- Produces: `GET /users/assignable` — consumed by Tasks 1c.4 and 1c.5.

---

- [ ] **Step 1: Add missing types to matter.ts**

Append to `packages/types/src/matter.ts`:

```typescript
export interface UpdateMatterInput {
  description?: string
  leadAdvocateId?: string | null
  supervisingPartnerId?: string | null
  clerkIds?: string[]
  opposingParty?: string | null
  opposingAdvocate?: string | null
  courtName?: string | null
  courtStation?: string | null
  courtDivision?: string | null
  courtFileNumber?: string | null
  judge?: string | null
  nextAction?: string | null
  nextActionDue?: string | null
  status?: MatterStatus
}

export interface CloseMatterInput {
  dateClosed?: string
  closureNote?: string
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/api/src/__tests__/matters.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { db } from '../db/client.js'
import { hashPassword } from '../lib/password.js'
import { signAccessToken } from '../lib/jwt.js'

const app = createApp()
let adminId: string
let adminToken: string
let clerkToken: string
let testClientId: string
let createdMatterId: string

beforeAll(async () => {
  const hash = await hashPassword('Test@1234!')

  const { rows: a } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ('admin@matters.test', $1, 'Admin', 'MTest', 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1 RETURNING id`,
    [hash],
  )
  adminId = a[0]!.id
  adminToken = signAccessToken(adminId, 'admin')

  const { rows: c } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ('clerk@matters.test', $1, 'Clerk', 'MTest', 'clerk')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1 RETURNING id`,
    [hash],
  )
  clerkToken = signAccessToken(c[0]!.id, 'clerk')

  const year = new Date().getFullYear()
  const { rows: cl } = await db.query<{ id: string }>(
    `INSERT INTO clients (client_id, client_type, full_name, created_by, updated_by)
     VALUES ($1, 'individual', 'Matter Test Client', $2, $2) RETURNING id`,
    [`CLT-${year}-99998`, adminId],
  )
  testClientId = cl[0]!.id
})

afterAll(async () => {
  if (createdMatterId) await db.query('DELETE FROM matters WHERE id = $1', [createdMatterId])
  if (testClientId) await db.query('DELETE FROM clients WHERE id = $1', [testClientId])
  await db.query("DELETE FROM users WHERE email IN ('admin@matters.test','clerk@matters.test')")
  await db.end()
})

describe('POST /matters', () => {
  it('creates a matter and returns 201 for admin', async () => {
    const res = await request(app)
      .post('/matters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientId: testClientId, matterType: 'LIT', description: 'Test litigation matter' })
    expect(res.status).toBe(201)
    expect(res.body.matterNumber).toMatch(/^LF/)
    expect(res.body.description).toBe('Test litigation matter')
    expect(Array.isArray(res.body.clerkIds)).toBe(true)
    createdMatterId = res.body.id as string
  })

  it('returns 403 for clerk', async () => {
    const res = await request(app)
      .post('/matters')
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ clientId: testClientId, matterType: 'LIT', description: 'x' })
    expect(res.status).toBe(403)
  })

  it('returns 400 for missing description', async () => {
    const res = await request(app)
      .post('/matters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientId: testClientId, matterType: 'LIT' })
    expect(res.status).toBe(400)
  })
})

describe('GET /matters', () => {
  it('returns paginated list for admin', async () => {
    const res = await request(app)
      .get('/matters')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
    expect(typeof res.body.total).toBe('number')
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/matters')
    expect(res.status).toBe(401)
  })
})

describe('GET /matters/types', () => {
  it('returns matter type codes for authenticated user', async () => {
    const res = await request(app)
      .get('/matters/types')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toHaveProperty('code')
    expect(res.body[0]).toHaveProperty('label')
  })
})

describe('GET /matters/:id', () => {
  it('returns matter with clerkIds array for admin', async () => {
    const res = await request(app)
      .get(`/matters/${createdMatterId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(createdMatterId)
    expect(Array.isArray(res.body.clerkIds)).toBe(true)
  })

  it('returns 404 for unknown UUID', async () => {
    const res = await request(app)
      .get('/matters/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })
})

describe('PUT /matters/:id', () => {
  it('updates matter and returns 200', async () => {
    const res = await request(app)
      .put(`/matters/${createdMatterId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Updated description', status: 'pending' })
    expect(res.status).toBe(200)
    expect(res.body.description).toBe('Updated description')
    expect(res.body.status).toBe('pending')
  })
})

describe('POST /matters/:id/close', () => {
  it('closes matter and returns status closed', async () => {
    const res = await request(app)
      .post(`/matters/${createdMatterId}/close`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ closureNote: 'Resolved amicably' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('closed')
    expect(res.body.dateClosed).toBeTruthy()
  })

  it('returns 409 for already-closed matter', async () => {
    const res = await request(app)
      .post(`/matters/${createdMatterId}/close`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
    expect(res.status).toBe(409)
  })
})

describe('GET /users/assignable', () => {
  it('returns active users for authenticated request', async () => {
    const res = await request(app)
      .get('/users/assignable')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```
cd apps/api && npm test -- matters
```
Expected: FAIL — modules not found.

- [ ] **Step 4: Create the matters service**

Create `apps/api/src/services/matters.ts`:

```typescript
import { db } from '../db/client.js'
import type { PoolClient } from 'pg'
import { generateMatterNumber } from '@hakios/utils'
import type {
  Matter,
  MatterStatus,
  CreateMatterInput,
  UpdateMatterInput,
  CloseMatterInput,
  CaseNumberSettings,
} from '@hakios/types'
import { createError } from '../middleware/errorHandler.js'

export interface ListMattersOptions {
  clientId?: string
  status?: MatterStatus
  search?: string
  page: number
  limit: number
  userId: string
  canReadAll: boolean
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

const MATTER_SELECT = `
  SELECT m.*,
    COALESCE(ARRAY_AGG(DISTINCT mc.user_id) FILTER (WHERE mc.user_id IS NOT NULL), '{}') AS clerk_ids,
    COALESCE(ARRAY_AGG(DISTINCT rm.related_matter_id) FILTER (WHERE rm.related_matter_id IS NOT NULL), '{}') AS related_matter_ids
  FROM matters m
  LEFT JOIN matter_clerks mc ON mc.matter_id = m.id
  LEFT JOIN related_matters rm ON rm.matter_id = m.id
`

function toMatter(row: Record<string, unknown>): Matter {
  return {
    id: row['id'] as string,
    matterNumber: row['matter_number'] as string,
    clientId: row['client_id'] as string,
    matterType: row['matter_type'] as string,
    description: row['description'] as string,
    status: row['status'] as Matter['status'],
    leadAdvocateId: (row['lead_advocate_id'] as string | null) ?? null,
    supervisingPartnerId: (row['supervising_partner_id'] as string | null) ?? null,
    clerkIds: (row['clerk_ids'] as string[]) ?? [],
    opposingParty: (row['opposing_party'] as string | null) ?? null,
    opposingAdvocate: (row['opposing_advocate'] as string | null) ?? null,
    courtName: (row['court_name'] as string | null) ?? null,
    courtStation: (row['court_station'] as string | null) ?? null,
    courtDivision: (row['court_division'] as string | null) ?? null,
    courtFileNumber: (row['court_file_number'] as string | null) ?? null,
    judge: (row['judge'] as string | null) ?? null,
    nextAction: (row['next_action'] as string | null) ?? null,
    nextActionDue: row['next_action_due']
      ? (row['next_action_due'] as Date).toISOString().slice(0, 10)
      : null,
    relatedMatterIds: (row['related_matter_ids'] as string[]) ?? [],
    dateOpened: (row['date_opened'] as Date).toISOString().slice(0, 10),
    dateClosed: row['date_closed']
      ? (row['date_closed'] as Date).toISOString().slice(0, 10)
      : null,
    openedBy: row['opened_by'] as string,
    updatedBy: row['updated_by'] as string,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  }
}

async function nextMatterSeq(year: number, pgClient: PoolClient): Promise<number> {
  const { rows } = await pgClient.query<{ seq: number }>(
    `INSERT INTO matter_sequences (year, next_val)
     VALUES ($1, 2)
     ON CONFLICT (year) DO UPDATE SET next_val = matter_sequences.next_val + 1
     RETURNING next_val - 1 AS seq`,
    [year],
  )
  return rows[0]!.seq
}

async function getCaseNumberSettings(pgClient: PoolClient): Promise<CaseNumberSettings> {
  const { rows } = await pgClient.query<{ value: CaseNumberSettings }>(
    `SELECT value FROM settings WHERE key = 'case_number'`,
  )
  if (!rows[0]) throw createError('Case number settings not configured', 500)
  return rows[0].value
}

export async function listMatters(opts: ListMattersOptions): Promise<PaginatedResult<Matter>> {
  const conditions: string[] = []
  const vals: unknown[] = []
  let i = 1

  if (!opts.canReadAll) {
    conditions.push(`m.id IN (
      SELECT id FROM matters
      WHERE lead_advocate_id = $${i} OR supervising_partner_id = $${i}
         OR id IN (SELECT matter_id FROM matter_clerks WHERE user_id = $${i})
    )`)
    vals.push(opts.userId)
    i++
  }

  if (opts.clientId) {
    conditions.push(`m.client_id = $${i}`)
    vals.push(opts.clientId)
    i++
  }

  if (opts.status) {
    conditions.push(`m.status = $${i}`)
    vals.push(opts.status)
    i++
  }

  if (opts.search) {
    conditions.push(`(m.matter_number ILIKE $${i} OR m.description ILIKE $${i})`)
    vals.push(`%${opts.search}%`)
    i++
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (opts.page - 1) * opts.limit

  const [countRes, rowsRes] = await Promise.all([
    db.query<{ total: string }>(
      `SELECT COUNT(DISTINCT m.id) AS total FROM matters m ${where}`,
      vals,
    ),
    db.query(
      `${MATTER_SELECT} ${where} GROUP BY m.id ORDER BY m.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...vals, opts.limit, offset],
    ),
  ])

  return {
    items: rowsRes.rows.map(toMatter),
    total: parseInt(countRes.rows[0]!.total, 10),
    page: opts.page,
    limit: opts.limit,
  }
}

export async function getMatter(id: string): Promise<Matter> {
  const { rows } = await db.query(
    `${MATTER_SELECT} WHERE m.id = $1 GROUP BY m.id`,
    [id],
  )
  if (!rows[0]) throw createError('Matter not found', 404, 'NOT_FOUND')
  return toMatter(rows[0])
}

export async function userCanAccessMatter(userId: string, matterId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM matters
     WHERE id = $1
       AND (lead_advocate_id = $2 OR supervising_partner_id = $2
            OR id IN (SELECT matter_id FROM matter_clerks WHERE user_id = $2))
     LIMIT 1`,
    [matterId, userId],
  )
  return rows.length > 0
}

export async function createMatter(input: CreateMatterInput, userId: string): Promise<Matter> {
  const year = new Date().getFullYear()
  const pgClient = await db.connect()
  try {
    await pgClient.query('BEGIN')
    const settings = await getCaseNumberSettings(pgClient)
    const seq = await nextMatterSeq(year, pgClient)
    const matterNumber = generateMatterNumber(settings, input.matterType, year, seq)

    const { rows } = await pgClient.query<{ id: string }>(
      `INSERT INTO matters (
        matter_number, client_id, matter_type, description,
        lead_advocate_id, supervising_partner_id,
        opposing_party, opposing_advocate,
        court_name, court_station, court_division, court_file_number, judge,
        next_action, next_action_due, opened_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
      RETURNING id`,
      [
        matterNumber, input.clientId, input.matterType, input.description,
        input.leadAdvocateId ?? null, input.supervisingPartnerId ?? null,
        input.opposingParty ?? null, input.opposingAdvocate ?? null,
        input.courtName ?? null, input.courtStation ?? null,
        input.courtDivision ?? null, input.courtFileNumber ?? null,
        input.judge ?? null, input.nextAction ?? null, input.nextActionDue ?? null,
        userId,
      ],
    )
    const matterId = rows[0]!.id

    if (input.clerkIds?.length) {
      const placeholders = input.clerkIds.map((_, k) => `($1, $${k + 2})`).join(', ')
      await pgClient.query(
        `INSERT INTO matter_clerks (matter_id, user_id) VALUES ${placeholders}`,
        [matterId, ...input.clerkIds],
      )
    }

    await pgClient.query(
      `INSERT INTO matter_timeline (matter_id, event_type, description, created_by)
       VALUES ($1, 'status_change', 'Matter opened', $2)`,
      [matterId, userId],
    )

    await pgClient.query('COMMIT')
    return getMatter(matterId)
  } catch (err) {
    await pgClient.query('ROLLBACK')
    throw err
  } finally {
    pgClient.release()
  }
}

export async function updateMatter(
  id: string,
  input: UpdateMatterInput,
  userId: string,
): Promise<Matter> {
  const existing = await getMatter(id)
  const pgClient = await db.connect()
  try {
    await pgClient.query('BEGIN')

    const fieldMap: Record<string, string> = {
      description: 'description',
      leadAdvocateId: 'lead_advocate_id', supervisingPartnerId: 'supervising_partner_id',
      opposingParty: 'opposing_party', opposingAdvocate: 'opposing_advocate',
      courtName: 'court_name', courtStation: 'court_station',
      courtDivision: 'court_division', courtFileNumber: 'court_file_number',
      judge: 'judge', nextAction: 'next_action', nextActionDue: 'next_action_due',
      status: 'status',
    }

    const setClauses: string[] = []
    const vals: unknown[] = []
    let i = 1

    for (const [jsKey, col] of Object.entries(fieldMap)) {
      if (jsKey in input) {
        setClauses.push(`${col} = $${i}`)
        const v = input[jsKey as keyof UpdateMatterInput]
        vals.push(v !== undefined ? v : null)
        i++
      }
    }

    if (setClauses.length > 0) {
      setClauses.push(`updated_by = $${i}`, `updated_at = now()`)
      vals.push(userId)
      i++
      vals.push(id)
      await pgClient.query(
        `UPDATE matters SET ${setClauses.join(', ')} WHERE id = $${i}`,
        vals,
      )
    }

    if (input.clerkIds !== undefined) {
      await pgClient.query('DELETE FROM matter_clerks WHERE matter_id = $1', [id])
      if (input.clerkIds.length > 0) {
        const placeholders = input.clerkIds.map((_, k) => `($1, $${k + 2})`).join(', ')
        await pgClient.query(
          `INSERT INTO matter_clerks (matter_id, user_id) VALUES ${placeholders}`,
          [id, ...input.clerkIds],
        )
      }
    }

    if (input.status && input.status !== existing.status) {
      await pgClient.query(
        `INSERT INTO matter_timeline (matter_id, event_type, description, created_by)
         VALUES ($1, 'status_change', $2, $3)`,
        [id, `Status changed from ${existing.status} to ${input.status}`, userId],
      )
    }

    await pgClient.query('COMMIT')
  } catch (err) {
    await pgClient.query('ROLLBACK')
    throw err
  } finally {
    pgClient.release()
  }

  return getMatter(id)
}

export async function closeMatter(
  id: string,
  input: CloseMatterInput,
  userId: string,
): Promise<Matter> {
  const dateClosed = input.dateClosed ?? new Date().toISOString().slice(0, 10)
  const pgClient = await db.connect()
  try {
    await pgClient.query('BEGIN')
    const { rows } = await pgClient.query<{ status: string }>(
      'SELECT status FROM matters WHERE id = $1 FOR UPDATE',
      [id],
    )
    if (!rows[0]) throw createError('Matter not found', 404, 'NOT_FOUND')
    if (rows[0].status === 'closed') throw createError('Matter is already closed', 409, 'ALREADY_CLOSED')

    await pgClient.query(
      `UPDATE matters SET status = 'closed', date_closed = $1, updated_by = $2, updated_at = now() WHERE id = $3`,
      [dateClosed, userId, id],
    )
    await pgClient.query(
      `INSERT INTO matter_timeline (matter_id, event_type, description, created_by)
       VALUES ($1, 'closure', $2, $3)`,
      [id, input.closureNote ?? 'Matter closed', userId],
    )
    await pgClient.query('COMMIT')
  } catch (err) {
    await pgClient.query('ROLLBACK')
    throw err
  } finally {
    pgClient.release()
  }
  return getMatter(id)
}
```

- [ ] **Step 5: Create the matters router**

Create `apps/api/src/routes/matters.ts`:

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { hasPermission } from '@hakios/types'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { createError } from '../middleware/errorHandler.js'
import * as mattersService from '../services/matters.js'
import { writeAuditLog } from '../lib/audit.js'
import { db } from '../db/client.js'

export const mattersRouter = Router()

const STATUSES = ['active', 'pending', 'adjourned', 'on_appeal', 'settled', 'closed'] as const

const createSchema = z.object({
  clientId: z.string().uuid(),
  matterType: z.string().min(1).max(20),
  description: z.string().min(1).max(2000),
  leadAdvocateId: z.string().uuid().optional(),
  supervisingPartnerId: z.string().uuid().optional(),
  clerkIds: z.array(z.string().uuid()).optional(),
  opposingParty: z.string().max(255).optional(),
  opposingAdvocate: z.string().max(255).optional(),
  courtName: z.string().max(255).optional(),
  courtStation: z.string().max(255).optional(),
  courtDivision: z.string().max(255).optional(),
  courtFileNumber: z.string().max(100).optional(),
  judge: z.string().max(255).optional(),
  nextAction: z.string().max(500).optional(),
  nextActionDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const updateSchema = z.object({
  description: z.string().min(1).max(2000).optional(),
  leadAdvocateId: z.string().uuid().nullable().optional(),
  supervisingPartnerId: z.string().uuid().nullable().optional(),
  clerkIds: z.array(z.string().uuid()).optional(),
  opposingParty: z.string().max(255).nullable().optional(),
  opposingAdvocate: z.string().max(255).nullable().optional(),
  courtName: z.string().max(255).nullable().optional(),
  courtStation: z.string().max(255).nullable().optional(),
  courtDivision: z.string().max(255).nullable().optional(),
  courtFileNumber: z.string().max(100).nullable().optional(),
  judge: z.string().max(255).nullable().optional(),
  nextAction: z.string().max(500).nullable().optional(),
  nextActionDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(STATUSES).optional(),
})

const closeSchema = z.object({
  dateClosed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  closureNote: z.string().max(2000).optional(),
})

const listQuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  status: z.enum(STATUSES).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// Must be before /:id
mattersRouter.get('/types', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await db.query<{ code: string; label: string }>(
      'SELECT code, label FROM matter_type_codes WHERE is_active = true ORDER BY label',
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

mattersRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!
    const canReadAll = hasPermission(user.role, 'matters:read_all')
    if (!canReadAll && !hasPermission(user.role, 'matters:read_assigned')) {
      return next(createError('Insufficient permissions', 403, 'FORBIDDEN'))
    }
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) return next(createError('Invalid query parameters', 400))
    const result = await mattersService.listMatters({ ...parsed.data, userId: user.id, canReadAll })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

mattersRouter.post('/', requireAuth, requireRole('matters:create'), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return next(createError('Invalid request body', 400))
    const matter = await mattersService.createMatter(parsed.data, req.user!.id)
    await writeAuditLog({ userId: req.user!.id, action: 'CREATE', recordType: 'matter', recordId: matter.id, afterValue: matter })
    res.status(201).json(matter)
  } catch (err) {
    next(err)
  }
})

mattersRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!
    const matter = await mattersService.getMatter(req.params['id']!)
    if (!hasPermission(user.role, 'matters:read_all')) {
      const ok = await mattersService.userCanAccessMatter(user.id, matter.id)
      if (!ok) return next(createError('Insufficient permissions', 403, 'FORBIDDEN'))
    }
    res.json(matter)
  } catch (err) {
    next(err)
  }
})

mattersRouter.put('/:id', requireAuth, requireRole('matters:edit'), async (req, res, next) => {
  try {
    const before = await mattersService.getMatter(req.params['id']!)
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) return next(createError('Invalid request body', 400))
    const after = await mattersService.updateMatter(req.params['id']!, parsed.data, req.user!.id)
    await writeAuditLog({ userId: req.user!.id, action: 'UPDATE', recordType: 'matter', recordId: after.id, beforeValue: before, afterValue: after })
    res.json(after)
  } catch (err) {
    next(err)
  }
})

mattersRouter.post('/:id/close', requireAuth, requireRole('matters:close'), async (req, res, next) => {
  try {
    const before = await mattersService.getMatter(req.params['id']!)
    const parsed = closeSchema.safeParse(req.body)
    if (!parsed.success) return next(createError('Invalid request body', 400))
    const after = await mattersService.closeMatter(req.params['id']!, parsed.data, req.user!.id)
    await writeAuditLog({ userId: req.user!.id, action: 'CLOSE', recordType: 'matter', recordId: after.id, beforeValue: before, afterValue: after })
    res.json(after)
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 6: Create the users router**

Create `apps/api/src/routes/users.ts`:

```typescript
import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { db } from '../db/client.js'

export const usersRouter = Router()

usersRouter.get('/assignable', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, first_name, last_name, role
       FROM users WHERE is_active = true ORDER BY first_name, last_name`,
    )
    res.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r['id'],
        email: r['email'],
        firstName: r['first_name'],
        lastName: r['last_name'],
        role: r['role'],
      })),
    )
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 7: Register new routers**

Edit `apps/api/src/routes/index.ts` — full replacement:

```typescript
import type { Express } from 'express'
import { authRouter } from './auth.js'
import { pushRouter } from './push.js'
import { clientsRouter } from './clients.js'
import { mattersRouter } from './matters.js'
import { usersRouter } from './users.js'

export function registerRoutes(app: Express): void {
  app.use('/auth', authRouter)
  app.use('/push', pushRouter)
  app.use('/clients', clientsRouter)
  app.use('/matters', mattersRouter)
  app.use('/users', usersRouter)
}
```

- [ ] **Step 8: Run matters tests**

```
cd apps/api && npm test -- matters
```
Expected: all 11 tests PASS.

- [ ] **Step 9: Typecheck and build**

```
cd c:\Users\kenneth.wamunyu\Desktop\Wawesh\HakiOS && npm run typecheck && npm run build -- --filter=@hakios/api
```
Expected: no errors.

- [ ] **Step 10: Commit**

```
git add packages/types/src/matter.ts apps/api/src/services/matters.ts apps/api/src/routes/matters.ts apps/api/src/routes/users.ts apps/api/src/routes/index.ts apps/api/src/__tests__/matters.test.ts
git commit -m "feat(api): add matters CRUD, matter-type lookup, and user assignable endpoint"
```

---

### Task 1c.3: Sidebar Layout + Dashboard + Shared Components

**Files:**
- Modify: `apps/web/src/components/Layout.tsx`
- Create: `apps/web/src/components/StatusBadge.tsx`
- Create: `apps/web/src/components/PageHeader.tsx`
- Create: `apps/web/src/pages/DashboardPage.tsx`
- Modify: `apps/web/src/router.tsx`

**Interfaces:**
- Produces: `<StatusBadge status={...}>` — accepts `ClientStatus | MatterStatus`. Used in Tasks 1c.4 and 1c.5.
- Produces: `<PageHeader title={...} action={...}>` — used in Tasks 1c.4 and 1c.5.

---

- [ ] **Step 1: Replace Layout with sidebar nav**

Full replacement of `apps/web/src/components/Layout.tsx`:

```tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { api } from '../lib/api'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/clients', label: 'Clients' },
  { to: '/matters', label: 'Matters' },
]

export function Layout() {
  const { user, refreshToken, clearAuth } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      if (refreshToken) {
        await api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) })
      }
    } finally {
      clearAuth()
      navigate('/auth/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-60 bg-primary flex flex-col shrink-0">
        <div className="px-6 py-5 border-b border-white/10">
          <span className="text-white font-semibold text-lg tracking-tight">HakiOS</span>
          <p className="text-white/50 text-xs mt-0.5">Practice Management</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-white/10">
          <p className="text-white/60 text-xs truncate mb-2">
            {user?.firstName} {user?.lastName}
          </p>
          <button
            onClick={handleLogout}
            className="text-white/60 hover:text-white text-xs underline transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Create StatusBadge**

Create `apps/web/src/components/StatusBadge.tsx`:

```tsx
import type { ClientStatus, MatterStatus } from '@hakios/types'

type Status = ClientStatus | MatterStatus

const STATUS_CONFIG: Record<Status, { label: string; className: string }> = {
  active:    { label: 'Active',     className: 'bg-green-100 text-green-800' },
  dormant:   { label: 'Dormant',    className: 'bg-gray-100 text-gray-600' },
  closed:    { label: 'Closed',     className: 'bg-red-100 text-red-700' },
  pending:   { label: 'Pending',    className: 'bg-yellow-100 text-yellow-800' },
  adjourned: { label: 'Adjourned',  className: 'bg-orange-100 text-orange-700' },
  on_appeal: { label: 'On Appeal',  className: 'bg-blue-100 text-blue-800' },
  settled:   { label: 'Settled',    className: 'bg-purple-100 text-purple-700' },
}

interface Props {
  status: Status
}

export function StatusBadge({ status }: Props) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
```

- [ ] **Step 3: Create PageHeader**

Create `apps/web/src/components/PageHeader.tsx`:

```tsx
interface Props {
  title: string
  action?: React.ReactNode
}

export function PageHeader({ title, action }: Props) {
  return (
    <div className="flex items-center justify-between px-8 py-5 border-b border-border bg-surface">
      <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
      {action && <div>{action}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Create DashboardPage**

Create `apps/web/src/pages/DashboardPage.tsx`:

```tsx
import { PageHeader } from '../components/PageHeader'

export function DashboardPage() {
  return (
    <div>
      <PageHeader title="Dashboard" />
      <div className="p-8">
        <p className="text-text-secondary text-sm">Matter analytics coming in Phase 2.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Update router to use DashboardPage**

Full replacement of `apps/web/src/router.tsx`:

```tsx
import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/auth/LoginPage'
import { SetPasswordPage } from './pages/auth/SetPasswordPage'
import { RequestResetPage } from './pages/auth/RequestResetPage'
import { DashboardPage } from './pages/DashboardPage'

export const router = createBrowserRouter([
  { path: '/auth/login', element: <LoginPage /> },
  { path: '/auth/setup-password', element: <SetPasswordPage mode="invite" /> },
  { path: '/auth/reset-password', element: <SetPasswordPage mode="reset" /> },
  { path: '/auth/reset-password/request', element: <RequestResetPage /> },
  {
    path: '/',
    element: <ProtectedRoute><Layout /></ProtectedRoute>,
    children: [
      { index: true, element: <DashboardPage /> },
    ],
  },
])
```

- [ ] **Step 6: Typecheck and build**

```
cd c:\Users\kenneth.wamunyu\Desktop\Wawesh\HakiOS && npm run typecheck && npm run build -- --filter=@hakios/web
```
Expected: no errors.

- [ ] **Step 7: Commit**

```
git add apps/web/src/components/Layout.tsx apps/web/src/components/StatusBadge.tsx apps/web/src/components/PageHeader.tsx apps/web/src/pages/DashboardPage.tsx apps/web/src/router.tsx
git commit -m "feat(web): sidebar layout, StatusBadge, PageHeader, DashboardPage"
```

---

### Task 1c.4: Client Pages

**Files:**
- Create: `apps/web/src/pages/clients/ClientsListPage.tsx`
- Create: `apps/web/src/pages/clients/CreateClientPage.tsx`
- Create: `apps/web/src/pages/clients/ClientDetailPage.tsx`
- Modify: `apps/web/src/router.tsx`

**Interfaces:**
- Consumes: `GET /clients`, `POST /clients`, `GET /clients/:id`, `PUT /clients/:id` (Task 1c.1).
- Consumes: `<StatusBadge>`, `<PageHeader>` (Task 1c.3).
- Consumes: `api<T>()` from `apps/web/src/lib/api.ts`.
- Consumes: `Client`, `CreateClientInput`, `UpdateClientInput` from `@hakios/types`.

---

- [ ] **Step 1: Create ClientsListPage**

Create `apps/web/src/pages/clients/ClientsListPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Client } from '@hakios/types'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'

interface PaginatedClients {
  items: Client[]
  total: number
  page: number
  limit: number
}

export function ClientsListPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<PaginatedClients | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (status) params.set('status', status)
    params.set('page', String(page))
    setError(null)
    api<PaginatedClients>(`/clients?${params.toString()}`)
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [search, status, page])

  const totalPages = data ? Math.ceil(data.total / (data.limit || 20)) : 0

  return (
    <div>
      <PageHeader
        title="Clients"
        action={
          <Link
            to="/clients/new"
            className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            New client
          </Link>
        }
      />
      <div className="p-8">
        <div className="flex gap-3 mb-6">
          <input
            type="search"
            placeholder="Search by name or ID…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-64"
          />
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="dormant">Dormant</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {error && <p className="text-status-overdue text-sm mb-4">{error}</p>}

        {!data ? (
          <p className="text-text-muted text-sm">Loading…</p>
        ) : (
          <>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-background border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Client ID</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-muted">No clients found</td>
                    </tr>
                  ) : (
                    data.items.map((client) => (
                      <tr
                        key={client.id}
                        className="hover:bg-background cursor-pointer"
                        onClick={() => navigate(`/clients/${client.id}`)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-text-secondary">{client.clientId}</td>
                        <td className="px-4 py-3 font-medium text-text-primary">{client.fullName}</td>
                        <td className="px-4 py-3 text-text-secondary capitalize">{client.clientType}</td>
                        <td className="px-4 py-3"><StatusBadge status={client.status} /></td>
                        <td className="px-4 py-3 text-text-secondary">{client.email ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-text-muted">{data.total} client{data.total !== 1 ? 's' : ''}</p>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 text-sm text-text-secondary">{page} / {totalPages}</span>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create CreateClientPage**

Create `apps/web/src/pages/clients/CreateClientPage.tsx`:

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import type { Client } from '@hakios/types'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'

const schema = z.object({
  clientType: z.enum(['individual', 'corporate']),
  fullName: z.string().min(1, 'Name is required'),
  idNumber: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  postalAddress: z.string().optional(),
  kraPin: z.string().optional(),
  hasConflict: z.boolean().optional(),
  conflictNotes: z.string().optional(),
  internalNotes: z.string().optional(),
})

type Form = z.infer<typeof schema>

const INPUT_CLASS = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const LABEL_CLASS = 'block text-sm font-medium text-text-primary mb-1'

export function CreateClientPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { clientType: 'individual', hasConflict: false },
  })

  const clientType = watch('clientType')
  const hasConflict = watch('hasConflict')

  async function onSubmit(data: Form) {
    setServerError(null)
    try {
      const payload = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== '' && v !== undefined && v !== false),
      )
      const client = await api<Client>('/clients', { method: 'POST', body: JSON.stringify(payload) })
      navigate(`/clients/${client.id}`)
    } catch (err) {
      setServerError((err as Error).message || 'Failed to create client.')
    }
  }

  return (
    <div>
      <PageHeader title="New Client" />
      <div className="p-8 max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <p className={LABEL_CLASS}>Client type</p>
            <div className="flex gap-6">
              {(['individual', 'corporate'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value={t} {...register('clientType')} className="accent-primary" />
                  <span className="text-sm capitalize">{t}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>
              {clientType === 'corporate' ? 'Company name' : 'Full name'} *
            </label>
            <input {...register('fullName')} className={INPUT_CLASS} />
            {errors.fullName && <p className="mt-1 text-xs text-status-overdue">{errors.fullName.message}</p>}
          </div>

          {clientType === 'individual' && (
            <div>
              <label className={LABEL_CLASS}>ID / Passport number</label>
              <input {...register('idNumber')} className={INPUT_CLASS} />
            </div>
          )}

          {clientType === 'corporate' && (
            <div>
              <label className={LABEL_CLASS}>Contact person</label>
              <input {...register('contactPerson')} className={INPUT_CLASS} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>Phone</label>
              <input {...register('phone')} className={INPUT_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Email</label>
              <input type="email" {...register('email')} className={INPUT_CLASS} />
              {errors.email && <p className="mt-1 text-xs text-status-overdue">{errors.email.message}</p>}
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Postal address</label>
            <input {...register('postalAddress')} className={INPUT_CLASS} />
          </div>

          <div>
            <label className={LABEL_CLASS}>KRA PIN</label>
            <input {...register('kraPin')} className={INPUT_CLASS} />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('hasConflict')} className="accent-primary" />
              <span className="text-sm font-medium text-text-primary">Conflict of interest flagged</span>
            </label>
            {hasConflict && (
              <div className="mt-2">
                <textarea
                  {...register('conflictNotes')}
                  rows={3}
                  placeholder="Describe the conflict…"
                  className={INPUT_CLASS}
                />
              </div>
            )}
          </div>

          <div>
            <label className={LABEL_CLASS}>Internal notes</label>
            <textarea {...register('internalNotes')} rows={3} className={INPUT_CLASS} />
          </div>

          {serverError && <p className="text-sm text-status-overdue">{serverError}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-6 py-2.5 rounded-lg transition disabled:opacity-60"
            >
              {isSubmitting ? 'Creating…' : 'Create client'}
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

- [ ] **Step 3: Create ClientDetailPage**

Create `apps/web/src/pages/clients/ClientDetailPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import type { Client } from '@hakios/types'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm text-text-primary mt-0.5">{value ?? '—'}</dd>
    </div>
  )
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [client, setClient] = useState<Client | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    api<Client>(`/clients/${id}`)
      .then(setClient)
      .catch((err: Error) => setError(err.message))
  }, [id])

  if (error) return <div className="p-8 text-status-overdue text-sm">{error}</div>
  if (!client) return <div className="p-8 text-text-muted text-sm">Loading…</div>

  return (
    <div>
      <PageHeader
        title={client.fullName}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={client.status} />
            <button
              onClick={() => navigate(`/clients/${id}/edit`)}
              className="border border-border text-text-secondary text-sm font-medium px-4 py-2 rounded-lg hover:bg-background transition"
            >
              Edit
            </button>
          </div>
        }
      />
      <div className="p-8 max-w-3xl space-y-8">
        <section>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Identity</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs text-text-muted">Client ID</dt>
              <dd className="font-mono text-sm text-text-primary mt-0.5">{client.clientId}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Type</dt>
              <dd className="text-sm text-text-primary mt-0.5 capitalize">{client.clientType}</dd>
            </div>
            {client.idNumber && <DetailRow label="ID / Passport" value={client.idNumber} />}
            {client.contactPerson && <DetailRow label="Contact Person" value={client.contactPerson} />}
            {client.kraPin && <DetailRow label="KRA PIN" value={client.kraPin} />}
          </dl>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Contact</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
            <DetailRow label="Phone" value={client.phone} />
            <DetailRow label="Email" value={client.email} />
            <div className="col-span-2">
              <DetailRow label="Postal Address" value={client.postalAddress} />
            </div>
          </dl>
        </section>

        {(client.hasConflict || client.internalNotes) && (
          <section>
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Notes</h2>
            {client.hasConflict && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-red-700 mb-1">Conflict of Interest</p>
                {client.conflictNotes && (
                  <p className="text-sm text-red-600">{client.conflictNotes}</p>
                )}
              </div>
            )}
            {client.internalNotes && (
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{client.internalNotes}</p>
            )}
          </section>
        )}

        <div>
          <Link
            to={`/matters?clientId=${client.id}`}
            className="text-sm text-primary hover:underline"
          >
            View matters for this client →
          </Link>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add client routes to router**

Full replacement of `apps/web/src/router.tsx`:

```tsx
import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/auth/LoginPage'
import { SetPasswordPage } from './pages/auth/SetPasswordPage'
import { RequestResetPage } from './pages/auth/RequestResetPage'
import { DashboardPage } from './pages/DashboardPage'
import { ClientsListPage } from './pages/clients/ClientsListPage'
import { CreateClientPage } from './pages/clients/CreateClientPage'
import { ClientDetailPage } from './pages/clients/ClientDetailPage'

export const router = createBrowserRouter([
  { path: '/auth/login', element: <LoginPage /> },
  { path: '/auth/setup-password', element: <SetPasswordPage mode="invite" /> },
  { path: '/auth/reset-password', element: <SetPasswordPage mode="reset" /> },
  { path: '/auth/reset-password/request', element: <RequestResetPage /> },
  {
    path: '/',
    element: <ProtectedRoute><Layout /></ProtectedRoute>,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'clients', element: <ClientsListPage /> },
      { path: 'clients/new', element: <CreateClientPage /> },
      { path: 'clients/:id', element: <ClientDetailPage /> },
    ],
  },
])
```

- [ ] **Step 5: Typecheck and build**

```
cd c:\Users\kenneth.wamunyu\Desktop\Wawesh\HakiOS && npm run typecheck && npm run build -- --filter=@hakios/web
```
Expected: no errors.

- [ ] **Step 6: Commit**

```
git add apps/web/src/pages/clients/ apps/web/src/router.tsx
git commit -m "feat(web): client list, create, and detail pages"
```

---

### Task 1c.5: Matter Pages

**Files:**
- Create: `apps/web/src/pages/matters/MattersListPage.tsx`
- Create: `apps/web/src/pages/matters/CreateMatterPage.tsx`
- Create: `apps/web/src/pages/matters/MatterDetailPage.tsx`
- Modify: `apps/web/src/router.tsx`

**Interfaces:**
- Consumes: `GET /matters`, `POST /matters`, `GET /matters/:id`, `PUT /matters/:id`, `POST /matters/:id/close`, `GET /matters/types` (Task 1c.2).
- Consumes: `GET /clients?limit=100` for the client dropdown (Task 1c.1).
- Consumes: `GET /users/assignable` (Task 1c.2).
- Consumes: `<StatusBadge>`, `<PageHeader>` (Task 1c.3).
- Consumes: `Matter`, `CreateMatterInput`, `UpdateMatterInput` from `@hakios/types`.

---

- [ ] **Step 1: Create MattersListPage**

Create `apps/web/src/pages/matters/MattersListPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Matter } from '@hakios/types'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'

interface PaginatedMatters {
  items: Matter[]
  total: number
  page: number
  limit: number
}

const STATUSES = ['active', 'pending', 'adjourned', 'on_appeal', 'settled', 'closed'] as const

export function MattersListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const clientId = searchParams.get('clientId')

  const [data, setData] = useState<PaginatedMatters | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (status) params.set('status', status)
    if (clientId) params.set('clientId', clientId)
    params.set('page', String(page))
    setError(null)
    api<PaginatedMatters>(`/matters?${params.toString()}`)
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [search, status, page, clientId])

  const totalPages = data ? Math.ceil(data.total / (data.limit || 20)) : 0

  return (
    <div>
      <PageHeader
        title="Matters"
        action={
          <Link
            to="/matters/new"
            className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            New matter
          </Link>
        }
      />
      <div className="p-8">
        <div className="flex gap-3 mb-6">
          <input
            type="search"
            placeholder="Search by matter number or description…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-72"
          />
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-status-overdue text-sm mb-4">{error}</p>}

        {!data ? (
          <p className="text-text-muted text-sm">Loading…</p>
        ) : (
          <>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-background border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Matter No.</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Opened</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-muted">No matters found</td>
                    </tr>
                  ) : (
                    data.items.map((matter) => (
                      <tr
                        key={matter.id}
                        className="hover:bg-background cursor-pointer"
                        onClick={() => navigate(`/matters/${matter.id}`)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-text-secondary">{matter.matterNumber}</td>
                        <td className="px-4 py-3 text-text-primary max-w-xs truncate">{matter.description}</td>
                        <td className="px-4 py-3 text-text-secondary">{matter.matterType}</td>
                        <td className="px-4 py-3"><StatusBadge status={matter.status} /></td>
                        <td className="px-4 py-3 text-text-secondary">{matter.dateOpened}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-text-muted">{data.total} matter{data.total !== 1 ? 's' : ''}</p>
                <div className="flex gap-2">
                  <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40">Previous</button>
                  <span className="px-3 py-1.5 text-sm text-text-secondary">{page} / {totalPages}</span>
                  <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create CreateMatterPage**

Create `apps/web/src/pages/matters/CreateMatterPage.tsx`:

```tsx
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import type { Client, Matter } from '@hakios/types'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'

interface TypeCode { code: string; label: string }
interface AssignableUser { id: string; firstName: string; lastName: string; role: string }
interface PaginatedClients { items: Client[]; total: number }

const schema = z.object({
  clientId: z.string().uuid('Select a client'),
  matterType: z.string().min(1, 'Select a matter type'),
  description: z.string().min(1, 'Description is required'),
  leadAdvocateId: z.string().uuid().optional().or(z.literal('')),
  supervisingPartnerId: z.string().uuid().optional().or(z.literal('')),
  clerkIds: z.array(z.string().uuid()).optional(),
  opposingParty: z.string().optional(),
  opposingAdvocate: z.string().optional(),
  courtName: z.string().optional(),
  courtStation: z.string().optional(),
  courtDivision: z.string().optional(),
  courtFileNumber: z.string().optional(),
  judge: z.string().optional(),
  nextAction: z.string().optional(),
  nextActionDue: z.string().optional(),
})

type Form = z.infer<typeof schema>

const INPUT_CLASS = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const LABEL_CLASS = 'block text-sm font-medium text-text-primary mb-1'

export function CreateMatterPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [users, setUsers] = useState<AssignableUser[]>([])
  const [typesCodes, setTypeCodes] = useState<TypeCode[]>([])

  useEffect(() => {
    Promise.all([
      api<PaginatedClients>('/clients?limit=100'),
      api<AssignableUser[]>('/users/assignable'),
      api<TypeCode[]>('/matters/types'),
    ]).then(([clientsRes, usersRes, typesRes]) => {
      setClients(clientsRes.items)
      setUsers(usersRes)
      setTypeCodes(typesRes)
    }).catch(() => {
      setServerError('Failed to load form data.')
    })
  }, [])

  const advocates = users.filter((u) => u.role === 'associate' || u.role === 'partner' || u.role === 'admin')
  const partners = users.filter((u) => u.role === 'partner' || u.role === 'admin')
  const clerks = users.filter((u) => u.role === 'clerk')

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { clerkIds: [] },
  })

  async function onSubmit(data: Form) {
    setServerError(null)
    try {
      const payload: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(data)) {
        if (v !== '' && v !== undefined && !(Array.isArray(v) && v.length === 0)) {
          payload[k] = v
        }
      }
      const matter = await api<Matter>('/matters', { method: 'POST', body: JSON.stringify(payload) })
      navigate(`/matters/${matter.id}`)
    } catch (err) {
      setServerError((err as Error).message || 'Failed to create matter.')
    }
  }

  return (
    <div>
      <PageHeader title="New Matter" />
      <div className="p-8 max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className={LABEL_CLASS}>Client *</label>
            <select {...register('clientId')} className={INPUT_CLASS}>
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.clientId} — {c.fullName}</option>
              ))}
            </select>
            {errors.clientId && <p className="mt-1 text-xs text-status-overdue">{errors.clientId.message}</p>}
          </div>

          <div>
            <label className={LABEL_CLASS}>Matter type *</label>
            <select {...register('matterType')} className={INPUT_CLASS}>
              <option value="">Select type…</option>
              {typesCodes.map((t) => (
                <option key={t.code} value={t.code}>{t.label}</option>
              ))}
            </select>
            {errors.matterType && <p className="mt-1 text-xs text-status-overdue">{errors.matterType.message}</p>}
          </div>

          <div>
            <label className={LABEL_CLASS}>Description *</label>
            <textarea {...register('description')} rows={3} className={INPUT_CLASS} />
            {errors.description && <p className="mt-1 text-xs text-status-overdue">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>Lead Advocate</label>
              <select {...register('leadAdvocateId')} className={INPUT_CLASS}>
                <option value="">None</option>
                {advocates.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Supervising Partner</label>
              <select {...register('supervisingPartnerId')} className={INPUT_CLASS}>
                <option value="">None</option>
                {partners.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
          </div>

          {clerks.length > 0 && (
            <div>
              <p className={LABEL_CLASS}>Clerks</p>
              <div className="space-y-1.5">
                <Controller
                  control={control}
                  name="clerkIds"
                  render={({ field }) => (
                    <>
                      {clerks.map((u) => (
                        <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            value={u.id}
                            checked={(field.value ?? []).includes(u.id)}
                            onChange={(e) => {
                              const current = field.value ?? []
                              field.onChange(
                                e.target.checked
                                  ? [...current, u.id]
                                  : current.filter((id) => id !== u.id),
                              )
                            }}
                            className="accent-primary"
                          />
                          <span className="text-sm">{u.firstName} {u.lastName}</span>
                        </label>
                      ))}
                    </>
                  )}
                />
              </div>
            </div>
          )}

          <div className="border-t border-border pt-5">
            <p className="text-sm font-medium text-text-secondary mb-4">Court details (optional)</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLASS}>Opposing party</label>
                <input {...register('opposingParty')} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>Opposing advocate</label>
                <input {...register('opposingAdvocate')} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>Court name</label>
                <input {...register('courtName')} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>Court station</label>
                <input {...register('courtStation')} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>Division</label>
                <input {...register('courtDivision')} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>Court file no.</label>
                <input {...register('courtFileNumber')} className={INPUT_CLASS} />
              </div>
              <div className="col-span-2">
                <label className={LABEL_CLASS}>Judge</label>
                <input {...register('judge')} className={INPUT_CLASS} />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <p className="text-sm font-medium text-text-secondary mb-4">Next action</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={LABEL_CLASS}>Action description</label>
                <input {...register('nextAction')} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>Due date</label>
                <input type="date" {...register('nextActionDue')} className={INPUT_CLASS} />
              </div>
            </div>
          </div>

          {serverError && <p className="text-sm text-status-overdue">{serverError}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-6 py-2.5 rounded-lg transition disabled:opacity-60"
            >
              {isSubmitting ? 'Creating…' : 'Create matter'}
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

- [ ] **Step 3: Create MatterDetailPage**

Create `apps/web/src/pages/matters/MatterDetailPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import type { Matter } from '@hakios/types'
import { hasPermission } from '@hakios/types'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm text-text-primary mt-0.5">{value ?? '—'}</dd>
    </div>
  )
}

export function MatterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [matter, setMatter] = useState<Matter | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (!id) return
    api<Matter>(`/matters/${id}`)
      .then(setMatter)
      .catch((err: Error) => setError(err.message))
  }, [id])

  async function handleClose() {
    if (!id || !window.confirm('Close this matter?')) return
    setClosing(true)
    try {
      const updated = await api<Matter>(`/matters/${id}/close`, { method: 'POST', body: JSON.stringify({}) })
      setMatter(updated)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setClosing(false)
    }
  }

  const canClose = user ? hasPermission(user.role, 'matters:close') : false

  if (error) return <div className="p-8 text-status-overdue text-sm">{error}</div>
  if (!matter) return <div className="p-8 text-text-muted text-sm">Loading…</div>

  return (
    <div>
      <PageHeader
        title={matter.matterNumber}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={matter.status} />
            {canClose && matter.status !== 'closed' && (
              <button
                onClick={handleClose}
                disabled={closing}
                className="border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {closing ? 'Closing…' : 'Close matter'}
              </button>
            )}
            <button
              onClick={() => navigate(`/matters/${id}/edit`)}
              className="border border-border text-text-secondary text-sm font-medium px-4 py-2 rounded-lg hover:bg-background transition"
            >
              Edit
            </button>
          </div>
        }
      />
      <div className="p-8 max-w-3xl space-y-8">
        <section>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Overview</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="col-span-2">
              <dt className="text-xs text-text-muted">Description</dt>
              <dd className="text-sm text-text-primary mt-0.5">{matter.description}</dd>
            </div>
            <Row label="Matter type" value={matter.matterType} />
            <Row label="Opened" value={matter.dateOpened} />
            {matter.dateClosed && <Row label="Closed" value={matter.dateClosed} />}
          </dl>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Assignments</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
            <Row label="Lead Advocate" value={matter.leadAdvocateId ?? null} />
            <Row label="Supervising Partner" value={matter.supervisingPartnerId ?? null} />
            <div>
              <dt className="text-xs text-text-muted">Clerks</dt>
              <dd className="text-sm text-text-primary mt-0.5">
                {matter.clerkIds.length ? matter.clerkIds.join(', ') : '—'}
              </dd>
            </div>
          </dl>
        </section>

        {(matter.opposingParty || matter.courtName) && (
          <section>
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Court Details</h2>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
              <Row label="Opposing Party" value={matter.opposingParty} />
              <Row label="Opposing Advocate" value={matter.opposingAdvocate} />
              <Row label="Court Name" value={matter.courtName} />
              <Row label="Court Station" value={matter.courtStation} />
              <Row label="Division" value={matter.courtDivision} />
              <Row label="Court File No." value={matter.courtFileNumber} />
              <Row label="Judge" value={matter.judge} />
            </dl>
          </section>
        )}

        {(matter.nextAction || matter.nextActionDue) && (
          <section>
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Next Action</h2>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div className="col-span-2">
                <Row label="Action" value={matter.nextAction} />
              </div>
              <Row label="Due date" value={matter.nextActionDue} />
            </dl>
          </section>
        )}

        <div>
          <Link
            to={`/clients/${matter.clientId}`}
            className="text-sm text-primary hover:underline"
          >
            ← View client record
          </Link>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add matter routes to router**

Full replacement of `apps/web/src/router.tsx`:

```tsx
import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/auth/LoginPage'
import { SetPasswordPage } from './pages/auth/SetPasswordPage'
import { RequestResetPage } from './pages/auth/RequestResetPage'
import { DashboardPage } from './pages/DashboardPage'
import { ClientsListPage } from './pages/clients/ClientsListPage'
import { CreateClientPage } from './pages/clients/CreateClientPage'
import { ClientDetailPage } from './pages/clients/ClientDetailPage'
import { MattersListPage } from './pages/matters/MattersListPage'
import { CreateMatterPage } from './pages/matters/CreateMatterPage'
import { MatterDetailPage } from './pages/matters/MatterDetailPage'

export const router = createBrowserRouter([
  { path: '/auth/login', element: <LoginPage /> },
  { path: '/auth/setup-password', element: <SetPasswordPage mode="invite" /> },
  { path: '/auth/reset-password', element: <SetPasswordPage mode="reset" /> },
  { path: '/auth/reset-password/request', element: <RequestResetPage /> },
  {
    path: '/',
    element: <ProtectedRoute><Layout /></ProtectedRoute>,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'clients', element: <ClientsListPage /> },
      { path: 'clients/new', element: <CreateClientPage /> },
      { path: 'clients/:id', element: <ClientDetailPage /> },
      { path: 'matters', element: <MattersListPage /> },
      { path: 'matters/new', element: <CreateMatterPage /> },
      { path: 'matters/:id', element: <MatterDetailPage /> },
    ],
  },
])
```

- [ ] **Step 5: Typecheck and build**

```
cd c:\Users\kenneth.wamunyu\Desktop\Wawesh\HakiOS && npm run typecheck && npm run build -- --filter=@hakios/web
```
Expected: no errors.

- [ ] **Step 6: Commit**

```
git add apps/web/src/pages/matters/ apps/web/src/router.tsx
git commit -m "feat(web): matter list, create, and detail pages"
```

---

## Self-Review

**Spec coverage check:**

| PRD requirement | Task |
|---|---|
| Clients CRUD — create with CLT-YYYY-NNNNN ID | 1c.1 |
| Clients — RBAC (read_all vs read_assigned) | 1c.1 |
| Clients — audit log on every mutation | 1c.1 |
| Matters CRUD — case number from settings | 1c.2 |
| Matters — clerk assignments via matter_clerks | 1c.2 |
| Matters — timeline entries on status change + closure | 1c.2 |
| Matters — close endpoint with date_closed | 1c.2 |
| Matters — RBAC (read_all vs read_assigned, matters:close) | 1c.2 |
| Users assignable endpoint for dropdown data | 1c.2 |
| Sidebar navigation | 1c.3 |
| StatusBadge for client and matter statuses | 1c.3 |
| Client list page with search + status filter | 1c.4 |
| Client create form | 1c.4 |
| Client detail page | 1c.4 |
| Matter list page with search + status + clientId filter | 1c.5 |
| Matter create form with clerk multi-select | 1c.5 |
| Matter detail page with close button | 1c.5 |

**Type consistency check:** `PaginatedResult<T>` is defined in both `services/clients.ts` and `services/matters.ts` with the same shape — intentional duplication to avoid a shared import that would couple the two services. Web pages define local `PaginatedClients`/`PaginatedMatters` interfaces with the same shape.

**Placeholder scan:** None found.

**Note on edit pages:** `/clients/:id/edit` and `/matters/:id/edit` are linked from detail pages but not implemented in this plan. They are Phase 1c scope gaps — add a `Task 1c.6` if the PRD requires them, or defer to Phase 2. The detail pages function without them (show-only).
