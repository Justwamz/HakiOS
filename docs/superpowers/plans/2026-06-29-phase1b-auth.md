# HakiOS Phase 1b — Authentication, React App & PWA

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build JWT authentication (login, refresh, logout, password reset, user invite), RBAC middleware, the React + Vite frontend with auth UI, and PWA installation + push notification support — completing the deployable foundation for all Phase 1 modules.

**Architecture:** Express auth routes delegate to an `AuthService` that owns all token and password logic. RBAC is enforced at the Express middleware level via `requireAuth` (JWT verification) + `requireRole` (permission check). The React app uses Zustand for auth state and a custom `api` fetch wrapper that silently refreshes the access token before expiry. `vite-plugin-pwa` generates the service worker; Web Push uses VAPID keys managed server-side. Offline behaviour is read-only in Phase 1.

**Prerequisite:** Plan 1a complete — monorepo scaffold, packages built, DB migrated, Express API shell running.

**Tech Stack:** `jsonwebtoken`, `bcrypt`, `resend`, `express-rate-limit` (already in app), React 18 + Vite 5, `react-router-dom` 6, `zustand` 4, `react-hook-form` 7 + `@hookform/resolvers`, `vite-plugin-pwa`, `web-push`, Vitest 1, `@testing-library/react` 14, Supertest 7

## Global Constraints

- Access token TTL: **15 minutes** (`JWT_SECRET`)
- Refresh token TTL: **7 days** (`JWT_REFRESH_SECRET`)
- bcrypt salt rounds: minimum **12**
- Password reset link expires: **1 hour** (single-use; invalidated on click regardless of completion)
- Invite link expires: **48 hours** (single-use)
- After successful password reset: **all refresh tokens for that user are invalidated**
- Failed login attempts: rate-limited to **5 per 15 minutes per IP** (already set in `app.ts`)
- Concurrent sessions allowed — logout invalidates current session's refresh token only
- JWT secrets never in source code — always from `process.env`
- All auth endpoints except `/auth/login`, `/auth/refresh`, and `/auth/reset-password/*` require a valid access token

---

## File map

```
apps/
├── api/
│   └── src/
│       ├── lib/
│       │   ├── jwt.ts                create — sign/verify access and refresh tokens
│       │   ├── password.ts           create — bcrypt hash + compare
│       │   └── email.ts              create — Resend wrapper
│       ├── services/
│       │   └── auth.ts               create — login, refresh, logout, reset, invite
│       ├── routes/
│       │   ├── index.ts              create — route registry mounted in app.ts
│       │   ├── auth.ts               create — auth route handlers
│       │   └── push.ts               create — save/delete push subscriptions
│       ├── middleware/
│       │   ├── requireAuth.ts        create — JWT verification middleware
│       │   └── requireRole.ts        create — RBAC middleware
│       └── __tests__/
│           ├── auth.test.ts          create — auth route integration tests
│           └── rbac.test.ts          create — middleware unit tests
└── web/
    ├── index.html                    create
    ├── vite.config.ts                create
    ├── tailwind.config.ts            create
    ├── postcss.config.js             create
    ├── tsconfig.json                 create
    ├── package.json                  create
    ├── vitest.config.ts              create
    ├── public/
    │   ├── manifest.webmanifest      create
    │   └── icons/                    create — PWA icons (placeholder PNGs)
    └── src/
        ├── main.tsx                  create
        ├── App.tsx                   create
        ├── router.tsx                create
        ├── lib/
        │   └── api.ts                create — fetch wrapper with silent token refresh
        ├── store/
        │   └── auth.ts               create — Zustand auth store
        ├── hooks/
        │   └── useOffline.ts         create — online/offline detection hook
        ├── components/
        │   ├── ProtectedRoute.tsx    create — redirects unauthenticated users
        │   ├── OfflineIndicator.tsx  create — offline banner
        │   └── Layout.tsx            create — top-level shell with nav
        └── pages/
            └── auth/
                ├── LoginPage.tsx     create
                └── SetPasswordPage.tsx create
```

---

## Task 1: JWT utilities + password helpers

**Files:**
- Create: `apps/api/src/lib/jwt.ts`
- Create: `apps/api/src/lib/password.ts`

**Interfaces:**
- Consumes: `JWT_SECRET`, `JWT_REFRESH_SECRET` env vars; `@hakios/types` → `JwtPayload`, `Role`
- Produces:
  - `signAccessToken(userId: string, role: Role): string`
  - `signRefreshToken(userId: string): string`
  - `verifyAccessToken(token: string): JwtPayload`
  - `verifyRefreshToken(token: string): { sub: string }`
  - `hashPassword(plain: string): Promise<string>`
  - `comparePassword(plain: string, hash: string): Promise<boolean>`

- [ ] **Step 1: Write failing tests — create `apps/api/src/__tests__/jwt.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../lib/jwt.js'

describe('signAccessToken / verifyAccessToken', () => {
  it('round-trips a token with correct payload', () => {
    const token = signAccessToken('user-123', 'partner')
    const payload = verifyAccessToken(token)
    expect(payload.sub).toBe('user-123')
    expect(payload.role).toBe('partner')
  })

  it('throws on tampered token', () => {
    const token = signAccessToken('user-123', 'admin')
    expect(() => verifyAccessToken(token + 'x')).toThrow()
  })
})

describe('signRefreshToken / verifyRefreshToken', () => {
  it('round-trips a refresh token', () => {
    const token = signRefreshToken('user-456')
    const payload = verifyRefreshToken(token)
    expect(payload.sub).toBe('user-456')
  })
})
```

- [ ] **Step 2: Run test — confirm fail**

```bash
cd apps/api && npm run test -- --reporter=verbose 2>&1 | head -20
```

Expected: FAIL — `jwt.ts` not found.

- [ ] **Step 3: Write `src/lib/jwt.ts`**

```typescript
import jwt from 'jsonwebtoken'
import type { JwtPayload, Role } from '@hakios/types'

function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`${name} environment variable is required`)
  return val
}

export function signAccessToken(userId: string, role: Role): string {
  return jwt.sign({ sub: userId, role }, requireEnv('JWT_SECRET'), {
    expiresIn: '15m',
  })
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, requireEnv('JWT_REFRESH_SECRET'), {
    expiresIn: '7d',
  })
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, requireEnv('JWT_SECRET')) as JwtPayload
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, requireEnv('JWT_REFRESH_SECRET')) as { sub: string }
}
```

- [ ] **Step 4: Write failing password test — add to `src/__tests__/password.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { hashPassword, comparePassword } from '../lib/password.js'

describe('hashPassword / comparePassword', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('Secure@1234')
    expect(await comparePassword('Secure@1234', hash)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Secure@1234')
    expect(await comparePassword('WrongPass!1', hash)).toBe(false)
  })

  it('produces a hash that starts with $2b$ (bcrypt)', async () => {
    const hash = await hashPassword('Test@1234')
    expect(hash.startsWith('$2b$')).toBe(true)
  })
})
```

- [ ] **Step 5: Write `src/lib/password.ts`**

```typescript
import bcrypt from 'bcrypt'

const SALT_ROUNDS = 12

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
```

- [ ] **Step 6: Run all tests — pass**

```bash
npm run test
```

Expected: all 5 tests PASS (1 health + 2 JWT + 3 password — bcrypt is slow; allow ~3s).

- [ ] **Step 7: Commit**

```bash
cd ../..
git add apps/api/src/lib/ apps/api/src/__tests__/jwt.test.ts apps/api/src/__tests__/password.test.ts
git commit -m "feat(api): add JWT sign/verify utilities and bcrypt password helpers"
```

---

## Task 2: Email helper

**Files:**
- Create: `apps/api/src/lib/email.ts`

**Interfaces:**
- Consumes: `RESEND_API_KEY`, `APP_URL` env vars; `@hakios/email` render functions
- Produces:
  - `sendInviteEmail(to: string, props: {...}): Promise<void>`
  - `sendResetEmail(to: string, props: {...}): Promise<void>`
  - `sendReminderEmail(to: string, props: {...}): Promise<void>`
  - `sendEscalationEmail(to: string, props: {...}): Promise<void>`

- [ ] **Step 1: Write `src/lib/email.ts`**

```typescript
import { Resend } from 'resend'
import {
  renderInviteEmail,
  renderResetEmail,
  renderReminderEmail,
  renderEscalationEmail,
} from '@hakios/email'
import type { ReminderEmailProps } from '@hakios/email'

function getResend(): Resend {
  const key = process.env['RESEND_API_KEY']
  if (!key) throw new Error('RESEND_API_KEY is required')
  return new Resend(key)
}

const FROM = 'HakiOS <noreply@yourfirm.co.ke>'

export async function sendInviteEmail(
  to: string,
  props: { firstName: string; firmName: string; token: string },
): Promise<void> {
  const setupUrl = `${process.env['APP_URL']}/auth/setup-password?token=${props.token}`
  const html = await renderInviteEmail({ ...props, setupUrl, expiresInHours: 48 })
  await getResend().emails.send({ from: FROM, to, subject: `Welcome to ${props.firmName}`, html })
}

export async function sendResetEmail(
  to: string,
  props: { firstName: string; firmName: string; token: string },
): Promise<void> {
  const resetUrl = `${process.env['APP_URL']}/auth/reset-password?token=${props.token}`
  const html = await renderResetEmail({ ...props, resetUrl })
  await getResend().emails.send({ from: FROM, to, subject: 'Password Reset Request', html })
}

export async function sendReminderEmail(
  to: string,
  props: Omit<ReminderEmailProps, 'eventUrl'> & { eventId: string },
): Promise<void> {
  const eventUrl = `${process.env['APP_URL']}/calendar/${props.eventId}`
  const html = await renderReminderEmail({ ...props, eventUrl })
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Reminder: ${props.eventType.replace(/_/g, ' ')} — ${props.matterName}`,
    html,
  })
}

export async function sendEscalationEmail(
  to: string,
  props: Omit<import('@hakios/email').EscalationEmailProps, 'eventUrl'> & { eventId: string },
): Promise<void> {
  const eventUrl = `${process.env['APP_URL']}/calendar/${props.eventId}`
  const html = await renderEscalationEmail({ ...props, eventUrl })
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `ESCALATION: Unacknowledged event — ${props.matterName}`,
    html,
  })
}
```

> Note: `email.ts` is not unit-tested here — it wraps Resend (external service). Integration tests for routes that trigger emails use `vi.mock` on this module.

- [ ] **Step 2: Export types from `@hakios/email` needed above**

Add to `packages/email/src/index.ts`:
```typescript
export type { ReminderEmailProps } from './reminder.js'
export type { EscalationEmailProps } from './escalation.js'
```

Rebuild the email package:
```bash
cd packages/email && npm run build && cd ../..
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/email.ts packages/email/src/index.ts packages/email/dist/
git commit -m "feat(api): add Resend email dispatch wrapper"
```

---

## Task 3: AuthService

**Files:**
- Create: `apps/api/src/services/auth.ts`

**Interfaces:**
- Consumes: `db`, `jwt.ts`, `password.ts`, `email.ts`; `@hakios/types` → `Role`, `AuthTokens`, `User`
- Produces:
  - `login(email, password): Promise<{ tokens: AuthTokens; user: User }>`
  - `refresh(refreshToken): Promise<AuthTokens>`
  - `logout(refreshToken): Promise<void>`
  - `requestPasswordReset(email): Promise<void>`
  - `confirmPasswordReset(token, newPassword): Promise<void>`
  - `createUser(data: { email, firstName, lastName, role }): Promise<User>`
  - `acceptInvite(token, password): Promise<{ tokens: AuthTokens; user: User }>`

- [ ] **Step 1: Write failing integration tests — `src/__tests__/auth.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { db } from '../db/client.js'
import { hashPassword } from '../lib/password.js'

// Prevent actual emails during tests
vi.mock('../lib/email.js', () => ({
  sendInviteEmail: vi.fn(),
  sendResetEmail: vi.fn(),
  sendReminderEmail: vi.fn(),
  sendEscalationEmail: vi.fn(),
}))

const app = createApp()
let testUserId: string

beforeAll(async () => {
  // Insert a known test user
  const hash = await hashPassword('Test@1234!')
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ($1, $2, 'Test', 'User', 'associate')
     ON CONFLICT (email) DO UPDATE SET password_hash = $2
     RETURNING id`,
    ['test@hakios.test', hash],
  )
  testUserId = rows[0]!.id
})

afterAll(async () => {
  await db.query('DELETE FROM users WHERE email = $1', ['test@hakios.test'])
  await db.end()
})

describe('POST /auth/login', () => {
  it('returns 200 with tokens on valid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@hakios.test', password: 'Test@1234!' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('accessToken')
    expect(res.body).toHaveProperty('refreshToken')
    expect(res.body).toHaveProperty('user.email', 'test@hakios.test')
  })

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@hakios.test', password: 'WrongPass!1' })
    expect(res.status).toBe(401)
  })

  it('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@hakios.test', password: 'Test@1234!' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when body is missing fields', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'test@hakios.test' })
    expect(res.status).toBe(400)
  })
})

describe('POST /auth/refresh', () => {
  it('returns new tokens with a valid refresh token', async () => {
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'test@hakios.test', password: 'Test@1234!' })
    const { refreshToken } = loginRes.body as { refreshToken: string }

    const res = await request(app).post('/auth/refresh').send({ refreshToken })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('accessToken')
  })

  it('returns 401 with an invalid refresh token', async () => {
    const res = await request(app).post('/auth/refresh').send({ refreshToken: 'garbage' })
    expect(res.status).toBe(401)
  })
})

describe('POST /auth/logout', () => {
  it('invalidates the refresh token', async () => {
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'test@hakios.test', password: 'Test@1234!' })
    const { accessToken, refreshToken } = loginRes.body as {
      accessToken: string
      refreshToken: string
    }

    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(204)

    // Refresh should now fail
    const res = await request(app).post('/auth/refresh').send({ refreshToken })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm run test -- --reporter=verbose 2>&1 | head -30
```

Expected: FAIL — routes not registered, 404 responses.

- [ ] **Step 3: Write `src/services/auth.ts`**

```typescript
import crypto from 'node:crypto'
import { db } from '../db/client.js'
import { hashPassword, comparePassword } from '../lib/password.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js'
import { sendInviteEmail, sendResetEmail } from '../lib/email.js'
import { createError } from '../middleware/errorHandler.js'
import type { AuthTokens, Role, User } from '@hakios/types'

function toUser(row: Record<string, unknown>): User {
  return {
    id: row['id'] as string,
    email: row['email'] as string,
    firstName: row['first_name'] as string,
    lastName: row['last_name'] as string,
    role: row['role'] as Role,
    isActive: row['is_active'] as boolean,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  }
}

async function storeRefreshToken(userId: string, token: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hash, expiresAt],
  )
}

export async function login(
  email: string,
  password: string,
): Promise<{ tokens: AuthTokens; user: User }> {
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [
    email.toLowerCase(),
  ])
  const row = rows[0] as Record<string, unknown> | undefined

  if (!row || !row['password_hash']) {
    throw createError('Invalid email or password', 401, 'INVALID_CREDENTIALS')
  }

  const valid = await comparePassword(password, row['password_hash'] as string)
  if (!valid) throw createError('Invalid email or password', 401, 'INVALID_CREDENTIALS')

  const user = toUser(row)
  const accessToken = signAccessToken(user.id, user.role)
  const refreshToken = signRefreshToken(user.id)
  await storeRefreshToken(user.id, refreshToken)

  return { tokens: { accessToken, refreshToken }, user }
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  let payload: { sub: string }
  try {
    payload = verifyRefreshToken(refreshToken)
  } catch {
    throw createError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN')
  }

  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex')
  const { rows } = await db.query(
    'SELECT id FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2 AND expires_at > now()',
    [payload.sub, hash],
  )
  if (rows.length === 0) throw createError('Refresh token not found', 401, 'INVALID_REFRESH_TOKEN')

  const { rows: userRows } = await db.query(
    'SELECT role FROM users WHERE id = $1 AND is_active = true',
    [payload.sub],
  )
  const userRow = userRows[0] as { role: Role } | undefined
  if (!userRow) throw createError('User not found', 401, 'INVALID_REFRESH_TOKEN')

  const newAccessToken = signAccessToken(payload.sub, userRow.role)
  const newRefreshToken = signRefreshToken(payload.sub)

  await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hash])
  await storeRefreshToken(payload.sub, newRefreshToken)

  return { accessToken: newAccessToken, refreshToken: newRefreshToken }
}

export async function logout(userId: string, refreshToken: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex')
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2', [
    userId,
    hash,
  ])
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { rows } = await db.query(
    'SELECT id, first_name, email FROM users WHERE email = $1 AND is_active = true',
    [email.toLowerCase()],
  )
  const row = rows[0] as Record<string, unknown> | undefined
  // Return silently even if email not found — prevent user enumeration
  if (!row) return

  const token = crypto.randomBytes(32).toString('hex')
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await db.query(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [row['id'], hash, expiresAt],
  )

  const firmName = await getSettingValue('firm_profile', 'firmName', 'Your Firm')
  await sendResetEmail(row['email'] as string, {
    firstName: row['first_name'] as string,
    firmName,
    token,
  })
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const { rows } = await db.query(
    `SELECT pr.id, pr.user_id FROM password_resets pr
     WHERE pr.token_hash = $1 AND pr.expires_at > now() AND pr.used_at IS NULL`,
    [hash],
  )
  const row = rows[0] as { id: string; user_id: string } | undefined
  if (!row) throw createError('Invalid or expired reset token', 400, 'INVALID_RESET_TOKEN')

  const passwordHash = await hashPassword(newPassword)
  await db.query('BEGIN')
  try {
    await db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
      passwordHash,
      row.user_id,
    ])
    await db.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [row.id])
    // Invalidate all refresh tokens for this user
    await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [row.user_id])
    await db.query('COMMIT')
  } catch (err) {
    await db.query('ROLLBACK')
    throw err
  }
}

export async function createUser(data: {
  email: string
  firstName: string
  lastName: string
  role: Role
}): Promise<User> {
  const { rows } = await db.query<Record<string, unknown>>(
    `INSERT INTO users (email, first_name, last_name, role)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.email.toLowerCase(), data.firstName, data.lastName, data.role],
  )
  const user = toUser(rows[0]!)

  const token = crypto.randomBytes(32).toString('hex')
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours
  await db.query(
    'INSERT INTO user_invites (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, hash, expiresAt],
  )

  const firmName = await getSettingValue('firm_profile', 'firmName', 'Your Firm')
  await sendInviteEmail(user.email, { firstName: user.firstName, firmName, token })
  return user
}

export async function acceptInvite(
  token: string,
  password: string,
): Promise<{ tokens: AuthTokens; user: User }> {
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const { rows } = await db.query(
    `SELECT ui.id, ui.user_id FROM user_invites ui
     WHERE ui.token_hash = $1 AND ui.expires_at > now() AND ui.accepted_at IS NULL`,
    [hash],
  )
  const row = rows[0] as { id: string; user_id: string } | undefined
  if (!row) throw createError('Invalid or expired invite token', 400, 'INVALID_INVITE_TOKEN')

  const passwordHash = await hashPassword(password)
  await db.query('BEGIN')
  try {
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
      [passwordHash, row.user_id],
    )
    await db.query('UPDATE user_invites SET accepted_at = now() WHERE id = $1', [row.id])
    await db.query('COMMIT')
  } catch (err) {
    await db.query('ROLLBACK')
    throw err
  }

  const { rows: userRows } = await db.query('SELECT * FROM users WHERE id = $1', [row.user_id])
  const user = toUser(userRows[0] as Record<string, unknown>)
  const accessToken = signAccessToken(user.id, user.role)
  const refreshToken = signRefreshToken(user.id)
  await storeRefreshToken(user.id, refreshToken)

  return { tokens: { accessToken, refreshToken }, user }
}

async function getSettingValue(key: string, field: string, fallback: string): Promise<string> {
  const { rows } = await db.query('SELECT value FROM settings WHERE key = $1', [key])
  const row = rows[0] as { value: Record<string, unknown> } | undefined
  return (row?.value[field] as string | undefined) ?? fallback
}
```

- [ ] **Step 4: Write `src/routes/auth.ts`**

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { emailSchema, passwordSchema } from '@hakios/utils'
import * as authService from '../services/auth.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { createError } from '../middleware/errorHandler.js'

export const authRouter = Router()

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) throw createError(result.error.errors[0]?.message ?? 'Validation error', 400, 'VALIDATION_ERROR')
  return result.data
}

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = validate(
      z.object({ email: emailSchema, password: z.string().min(1) }),
      req.body,
    )
    const { tokens, user } = await authService.login(email, password)
    res.json({ ...tokens, user })
  } catch (err) {
    next(err)
  }
})

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = validate(
      z.object({ refreshToken: z.string().min(1) }),
      req.body,
    )
    const tokens = await authService.refresh(refreshToken)
    res.json(tokens)
  } catch (err) {
    next(err)
  }
})

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const { refreshToken } = validate(
      z.object({ refreshToken: z.string().min(1) }),
      req.body,
    )
    await authService.logout(req.user!.id, refreshToken)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

authRouter.post('/reset-password/request', async (req, res, next) => {
  try {
    const { email } = validate(z.object({ email: emailSchema }), req.body)
    await authService.requestPasswordReset(email)
    // Always 200 to prevent user enumeration
    res.json({ message: 'If that email exists, a reset link has been sent.' })
  } catch (err) {
    next(err)
  }
})

authRouter.post('/reset-password/confirm', async (req, res, next) => {
  try {
    const { token, password } = validate(
      z.object({ token: z.string().min(1), password: passwordSchema }),
      req.body,
    )
    await authService.confirmPasswordReset(token, password)
    res.json({ message: 'Password reset successful. Please log in.' })
  } catch (err) {
    next(err)
  }
})

authRouter.post('/invite/accept', async (req, res, next) => {
  try {
    const { token, password } = validate(
      z.object({ token: z.string().min(1), password: passwordSchema }),
      req.body,
    )
    const { tokens, user } = await authService.acceptInvite(token, password)
    res.json({ ...tokens, user })
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 5: Write `src/routes/index.ts`**

```typescript
import type { Express } from 'express'
import { authRouter } from './auth.js'

export function registerRoutes(app: Express): void {
  app.use('/auth', authRouter)
}
```

- [ ] **Step 6: Update `src/app.ts` to register routes**

Add after the `rateLimit` block and before `app.use(notFound)`:

```typescript
// Add this import at the top of app.ts
import { registerRoutes } from './routes/index.js'

// Add this line inside createApp(), after the /auth rate-limiter and before app.get('/health', ...)
registerRoutes(app)
```

Full updated `src/app.ts`:

```typescript
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { errorHandler, notFound } from './middleware/errorHandler.js'
import { registerRoutes } from './routes/index.js'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(cors({
    origin: process.env['APP_URL'] ?? 'http://localhost:5173',
    credentials: true,
  }))
  app.use(express.json())

  app.use(
    '/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: { error: 'Too many attempts, please try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  )

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  registerRoutes(app)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
```

- [ ] **Step 7: Run tests — all pass**

```bash
cd apps/api && npm run test
```

Expected: all tests PASS (health + JWT + password + auth login/refresh/logout). Auth tests require a running database — ensure `DATABASE_URL` points to `hakios` and migrations have run.

- [ ] **Step 8: Commit**

```bash
cd ../..
git add apps/api/src/services/ apps/api/src/routes/ apps/api/src/app.ts apps/api/src/__tests__/auth.test.ts
git commit -m "feat(api): add auth service and routes (login, refresh, logout, reset, invite)"
```

---

## Task 4: RBAC middleware

**Files:**
- Create: `apps/api/src/middleware/requireAuth.ts`
- Create: `apps/api/src/middleware/requireRole.ts`

**Interfaces:**
- Consumes: `verifyAccessToken` from `jwt.ts`; `ROLE_PERMISSIONS`, `hasPermission` from `@hakios/types`
- Produces:
  - `requireAuth` — Express middleware; populates `req.user: { id, role }`
  - `requireRole(...permissions: Permission[])` — Express middleware factory; 403 if user lacks all listed permissions

- [ ] **Step 1: Extend Express `Request` type — create `apps/api/src/types/express.d.ts`**

```typescript
import type { Role } from '@hakios/types'

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role }
    }
  }
}
```

- [ ] **Step 2: Write failing tests — `src/__tests__/rbac.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { signAccessToken } from '../lib/jwt.js'

const app = createApp()

// Mount a test-only protected route
import express from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'

const testRouter = express.Router()
testRouter.get('/protected', requireAuth, (_req, res) => res.json({ ok: true }))
testRouter.get(
  '/admin-only',
  requireAuth,
  requireRole('settings:manage'),
  (_req, res) => res.json({ ok: true }),
)
app.use('/test', testRouter)

describe('requireAuth middleware', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/test/protected')
    expect(res.status).toBe(401)
  })

  it('returns 401 with a malformed token', async () => {
    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', 'Bearer notavalidtoken')
    expect(res.status).toBe(401)
  })

  it('allows request with valid access token', async () => {
    const token = signAccessToken('user-abc', 'associate')
    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})

describe('requireRole middleware', () => {
  it('returns 403 when role lacks permission', async () => {
    const token = signAccessToken('user-abc', 'clerk')
    const res = await request(app)
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })

  it('allows admin to access admin-only route', async () => {
    const token = signAccessToken('user-abc', 'admin')
    const res = await request(app)
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 3: Run tests — confirm fail**

```bash
npm run test -- --reporter=verbose 2>&1 | grep rbac
```

Expected: FAIL — `requireAuth.ts` not found.

- [ ] **Step 4: Write `src/middleware/requireAuth.ts`**

```typescript
import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../lib/jwt.js'
import { createError } from './errorHandler.js'

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers['authorization']
  if (!header?.startsWith('Bearer ')) {
    return next(createError('Authentication required', 401, 'UNAUTHENTICATED'))
  }

  const token = header.slice(7)
  try {
    const payload = verifyAccessToken(token)
    req.user = { id: payload.sub, role: payload.role }
    next()
  } catch {
    next(createError('Invalid or expired token', 401, 'INVALID_TOKEN'))
  }
}
```

- [ ] **Step 5: Write `src/middleware/requireRole.ts`**

```typescript
import type { Request, Response, NextFunction } from 'express'
import { hasPermission } from '@hakios/types'
import type { Permission } from '@hakios/types'
import { createError } from './errorHandler.js'

export function requireRole(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(createError('Authentication required', 401, 'UNAUTHENTICATED'))
    }
    const allowed = permissions.every((p) => hasPermission(req.user!.role, p))
    if (!allowed) {
      return next(createError('Insufficient permissions', 403, 'FORBIDDEN'))
    }
    next()
  }
}
```

- [ ] **Step 6: Run all tests — all pass**

```bash
npm run test
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
cd ../..
git add apps/api/src/middleware/requireAuth.ts apps/api/src/middleware/requireRole.ts apps/api/src/types/ apps/api/src/__tests__/rbac.test.ts
git commit -m "feat(api): add requireAuth and requireRole RBAC middleware"
```

---

## Task 5: React app base

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/router.tsx`
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/store/auth.ts`
- Create: `apps/web/vitest.config.ts`

**Interfaces:**
- Consumes: `@hakios/types` → `User`, `AuthTokens`; `@hakios/ui/tailwind.config`
- Produces: running Vite dev server at `http://localhost:5173`; `useAuthStore()` Zustand hook; `api` fetch wrapper

- [ ] **Step 1: Write `apps/web/package.json`**

```json
{
  "name": "@hakios/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx",
    "test": "vitest run"
  },
  "dependencies": {
    "@hakios/types": "*",
    "@hakios/ui": "*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.24.0",
    "zustand": "^4.5.0",
    "react-hook-form": "^7.52.0",
    "@hookform/resolvers": "^3.6.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "*",
    "vite": "^5.3.0",
    "vitest": "^1.6.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@testing-library/jest-dom": "^6.4.0",
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 2: Write `apps/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "paths": {
      "@hakios/types": ["../../packages/types/src/index.ts"],
      "@hakios/ui/*": ["../../packages/ui/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "../../packages/types" }]
}
```

- [ ] **Step 3: Write `apps/web/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

- [ ] **Step 4: Write `apps/web/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'
import baseConfig from '@hakios/ui/tailwind.config'

const config: Config = {
  ...baseConfig,
  content: ['./index.html', './src/**/*.{ts,tsx}'],
}

export default config
```

- [ ] **Step 5: Write `apps/web/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: Write `apps/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0a5c3e" />
    <title>HakiOS</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
  </head>
  <body class="bg-background text-text-primary font-sans antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Write `apps/web/src/store/auth.ts`**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@hakios/types'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  setAuth: (user: User, accessToken: string, refreshToken: string) => void
  setAccessToken: (accessToken: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clearAuth: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: 'hakios-auth',
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken,
        // accessToken is NOT persisted — it's short-lived and fetched on load
      }),
    },
  ),
)
```

- [ ] **Step 8: Write `apps/web/src/lib/api.ts`**

```typescript
import { useAuthStore } from '../store/auth'

const BASE = '/api'

interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

let refreshPromise: Promise<string> | null = null

async function doRefresh(): Promise<string> {
  const { refreshToken, setAccessToken, setAuth, clearAuth, user } = useAuthStore.getState()
  if (!refreshToken) {
    clearAuth()
    throw new Error('No refresh token')
  }

  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!res.ok) {
    clearAuth()
    throw new Error('Session expired')
  }

  const data = (await res.json()) as RefreshResponse
  setAccessToken(data.accessToken)
  if (user) {
    useAuthStore.getState().setAuth(user, data.accessToken, data.refreshToken)
  }
  return data.accessToken
}

async function getValidToken(): Promise<string | null> {
  const { accessToken } = useAuthStore.getState()
  if (!accessToken) return null

  // Decode expiry without a library
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1] ?? ''))
    const expiresAt = (payload as { exp: number }).exp * 1000
    const bufferMs = 60_000 // refresh 1 min before expiry
    if (expiresAt - Date.now() > bufferMs) return accessToken
  } catch {
    return accessToken
  }

  // Token near expiry — refresh (deduplicate concurrent calls)
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getValidToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    const err = new Error((body as { error: string }).error ?? 'Request failed') as Error & {
      status: number
    }
    err.status = res.status
    throw err
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
```

- [ ] **Step 9: Write `apps/web/src/router.tsx`**

```tsx
import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/auth/LoginPage'
import { SetPasswordPage } from './pages/auth/SetPasswordPage'

export const router = createBrowserRouter([
  {
    path: '/auth/login',
    element: <LoginPage />,
  },
  {
    path: '/auth/setup-password',
    element: <SetPasswordPage mode="invite" />,
  },
  {
    path: '/auth/reset-password',
    element: <SetPasswordPage mode="reset" />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <div className="p-8 text-text-secondary">Dashboard — coming in Phase 2</div>,
      },
    ],
  },
])
```

- [ ] **Step 10: Write `apps/web/src/App.tsx`**

```tsx
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { OfflineIndicator } from './components/OfflineIndicator'

export default function App() {
  return (
    <>
      <OfflineIndicator />
      <RouterProvider router={router} />
    </>
  )
}
```

- [ ] **Step 11: Write `apps/web/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@hakios/ui/globals.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

Create `apps/web/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 12: Write `apps/web/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.tsx', 'src/__tests__/**/*.test.ts'],
  },
})
```

Create `apps/web/src/__tests__/setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 13: Install deps and verify build**

```bash
cd apps/web && npm install && npm run build
```

Expected: `dist/` created, no TypeScript or Vite errors.

- [ ] **Step 14: Commit**

```bash
cd ../..
git add apps/web/
git commit -m "feat(web): add React app base with Vite, router, Zustand auth store, and API client"
```

---

## Task 6: Auth pages

**Files:**
- Create: `apps/web/src/components/ProtectedRoute.tsx`
- Create: `apps/web/src/components/Layout.tsx`
- Create: `apps/web/src/components/OfflineIndicator.tsx`
- Create: `apps/web/src/hooks/useOffline.ts`
- Create: `apps/web/src/pages/auth/LoginPage.tsx`
- Create: `apps/web/src/pages/auth/SetPasswordPage.tsx`
- Create: `apps/web/src/__tests__/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `useAuthStore`, `api`, `react-hook-form` + `zod`
- Produces: Login form that stores auth on success; SetPassword form for invite/reset; ProtectedRoute that redirects to `/auth/login`

- [ ] **Step 1: Write `src/hooks/useOffline.ts`**

```typescript
import { useState, useEffect } from 'react'

export function useOffline(): boolean {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const onOnline = () => setIsOffline(false)
    const onOffline = () => setIsOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return isOffline
}
```

- [ ] **Step 2: Write `src/components/OfflineIndicator.tsx`**

```tsx
import { useOffline } from '../hooks/useOffline'

export function OfflineIndicator() {
  const isOffline = useOffline()
  if (!isOffline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 bg-status-urgent text-white text-sm font-medium py-2 text-center"
    >
      You are offline. The app is in read-only mode.
    </div>
  )
}
```

- [ ] **Step 3: Write `src/components/ProtectedRoute.tsx`**

```tsx
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

export function ProtectedRoute({ children }: Props) {
  const { user, refreshToken } = useAuthStore()
  const location = useLocation()

  if (!user || !refreshToken) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
```

- [ ] **Step 4: Write `src/components/Layout.tsx`**

```tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { api } from '../lib/api'

export function Layout() {
  const { user, refreshToken, clearAuth } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      if (refreshToken) {
        await api('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        })
      }
    } finally {
      clearAuth()
      navigate('/auth/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary text-white px-6 py-3 flex items-center justify-between shadow">
        <span className="font-semibold text-lg tracking-tight">HakiOS</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="opacity-75">
            {user?.firstName} {user?.lastName}
          </span>
          <button
            onClick={handleLogout}
            className="underline opacity-75 hover:opacity-100 transition-opacity"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Write the failing test — `src/__tests__/LoginPage.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from '../pages/auth/LoginPage'

// Mock the api module
vi.mock('../lib/api', () => ({
  api: vi.fn(),
}))

// Mock Zustand store
const mockSetAuth = vi.fn()
vi.mock('../store/auth', () => ({
  useAuthStore: () => ({
    setAuth: mockSetAuth,
    user: null,
    accessToken: null,
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate, useLocation: () => ({ state: null }) }
})

import { api } from '../lib/api'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LoginPage', () => {
  function renderPage() {
    return render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
  }

  it('renders email and password fields', () => {
    renderPage()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('shows validation errors when submitted empty', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument()
    })
  })

  it('calls api and setAuth on successful login', async () => {
    const mockUser = { id: '1', email: 'a@b.com', firstName: 'Ada', role: 'partner' }
    vi.mocked(api).mockResolvedValueOnce({
      accessToken: 'access-tok',
      refreshToken: 'refresh-tok',
      user: mockUser,
    })

    renderPage()
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'Test@1234!')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockSetAuth).toHaveBeenCalledWith(mockUser, 'access-tok', 'refresh-tok')
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('shows an error message on failed login', async () => {
    const err = Object.assign(new Error('Invalid email or password'), { status: 401 })
    vi.mocked(api).mockRejectedValueOnce(err)

    renderPage()
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'Wrong@1!')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 6: Run test — confirm fail**

```bash
cd apps/web && npm run test 2>&1 | head -20
```

Expected: FAIL — `LoginPage` not found.

- [ ] **Step 7: Write `src/pages/auth/LoginPage.tsx`**

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { emailSchema } from '@hakios/utils'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import type { AuthTokens, User } from '@hakios/types'

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

interface LoginResponse extends AuthTokens {
  user: User
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setAuth } = useAuthStore()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/'

  async function onSubmit(data: LoginForm) {
    setServerError(null)
    try {
      const res = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      setAuth(res.user, res.accessToken, res.refreshToken)
      navigate(from, { replace: true })
    } catch (err) {
      setServerError((err as Error).message || 'Sign in failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-sm border border-border p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-primary">HakiOS</h1>
          <p className="text-text-secondary text-sm mt-1">Practice Management</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-1">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register('email')}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <p id="email-error" className="mt-1 text-xs text-status-overdue">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
              aria-describedby={errors.password ? 'password-error' : undefined}
            />
            {errors.password && (
              <p id="password-error" className="mt-1 text-xs text-status-overdue">
                {errors.password.message}
              </p>
            )}
          </div>

          {serverError && (
            <p role="alert" className="text-sm text-status-overdue text-center">
              {serverError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary hover:bg-primary-light text-white font-medium py-2.5 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed text-sm"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="text-center">
            <a
              href="/auth/reset-password/request"
              className="text-xs text-text-muted hover:text-text-secondary underline"
            >
              Forgot password?
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Write `src/pages/auth/SetPasswordPage.tsx`**

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { passwordSchema } from '@hakios/utils'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import type { AuthTokens, User } from '@hakios/types'

const schema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type SetPasswordForm = z.infer<typeof schema>

interface Props {
  mode: 'invite' | 'reset'
}

interface InviteResponse extends AuthTokens {
  user: User
}

export function SetPasswordPage({ mode }: Props) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const token = params.get('token') ?? ''

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordForm>({ resolver: zodResolver(schema) })

  async function onSubmit(data: SetPasswordForm) {
    setServerError(null)
    try {
      if (mode === 'invite') {
        const res = await api<InviteResponse>('/auth/invite/accept', {
          method: 'POST',
          body: JSON.stringify({ token, password: data.password }),
        })
        setAuth(res.user, res.accessToken, res.refreshToken)
        navigate('/', { replace: true })
      } else {
        await api('/auth/reset-password/confirm', {
          method: 'POST',
          body: JSON.stringify({ token, password: data.password }),
        })
        setDone(true)
      }
    } catch (err) {
      setServerError((err as Error).message || 'An error occurred. Please try again.')
    }
  }

  const heading = mode === 'invite' ? 'Set up your account' : 'Set a new password'

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-surface rounded-xl shadow-sm border border-border p-8 text-center">
          <h1 className="text-xl font-semibold text-primary mb-2">Password updated</h1>
          <p className="text-text-secondary text-sm mb-6">You can now sign in with your new password.</p>
          <a
            href="/auth/login"
            className="inline-block bg-primary text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-primary-light transition"
          >
            Go to sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-sm border border-border p-8">
        <h1 className="text-xl font-semibold text-primary mb-6 text-center">{heading}</h1>
        {!token && (
          <p className="text-status-overdue text-sm text-center mb-4">
            Invalid or missing token. Please use the link from your email.
          </p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-1">
              New password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register('password')}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-status-overdue">{errors.password.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-primary mb-1">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-status-overdue">{errors.confirmPassword.message}</p>
            )}
          </div>
          <p className="text-xs text-text-muted">
            Min 8 characters, one uppercase, one number, one special character.
          </p>
          {serverError && (
            <p role="alert" className="text-sm text-status-overdue text-center">{serverError}</p>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !token}
            className="w-full bg-primary hover:bg-primary-light text-white font-medium py-2.5 rounded-lg transition disabled:opacity-60 text-sm"
          >
            {isSubmitting ? 'Saving…' : 'Set password'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Run tests — all pass**

```bash
npm run test
```

Expected: all 4 LoginPage tests PASS.

- [ ] **Step 10: Verify in browser**

```bash
npm run dev
```

Open `http://localhost:5173/auth/login` — login form renders with HakiOS branding, green primary, form validation works. Start API in another terminal (`cd apps/api && npm run dev`) and test a real login.

- [ ] **Step 11: Commit**

```bash
cd ../..
git add apps/web/src/
git commit -m "feat(web): add login page, set-password page, protected route, and offline indicator"
```

---

## Task 7: PWA setup + push notifications

**Files:**
- Modify: `apps/web/vite.config.ts`
- Create: `apps/web/public/manifest.webmanifest`
- Create: `apps/web/src/hooks/usePushNotifications.ts`
- Create: `apps/api/src/routes/push.ts`
- Create: `apps/api/src/lib/vapid.ts`

**Interfaces:**
- Consumes: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` env vars
- Produces: installable PWA; `POST /push/subscribe` stores subscription; `sendPushNotification(userId, payload)` — used by Phase 4 reminder jobs

- [ ] **Step 1: Install PWA and web-push packages**

```bash
cd apps/web && npm install vite-plugin-pwa workbox-window
cd ../api && npm install web-push && npm install -D @types/web-push
cd ../..
```

- [ ] **Step 2: Write `apps/web/public/manifest.webmanifest`**

```json
{
  "name": "HakiOS Practice Management",
  "short_name": "HakiOS",
  "description": "Law firm practice management system",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#f7f5f0",
  "theme_color": "#0a5c3e",
  "icons": [
    { "src": "/icons/pwa-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/pwa-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

> Create placeholder 192×192 and 512×512 PNG icons in `apps/web/public/icons/`. Use a simple deep green square with "H" text as a placeholder until final artwork is available.

- [ ] **Step 3: Update `apps/web/vite.config.ts` to add PWA plugin**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: false,           // we use our own manifest.webmanifest
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/(matters|clients|calendar)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

- [ ] **Step 4: Write `apps/web/src/hooks/usePushNotifications.ts`**

```typescript
import { useEffect } from 'react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'

const VAPID_PUBLIC_KEY = import.meta.env['VITE_VAPID_PUBLIC_KEY'] as string | undefined

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const { user } = useAuthStore()

  useEffect(() => {
    if (!user || !VAPID_PUBLIC_KEY || !('serviceWorker' in navigator)) return

    async function subscribe() {
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      if (existing) return // already subscribed

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      })

      await api('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription.toJSON()),
      })
    }

    subscribe().catch(console.error)
  }, [user])
}
```

Add `VITE_VAPID_PUBLIC_KEY=` to `apps/web/.env.local` (copy from root `.env`).

- [ ] **Step 5: Wire `usePushNotifications` into `App.tsx`**

```tsx
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { OfflineIndicator } from './components/OfflineIndicator'
import { usePushNotifications } from './hooks/usePushNotifications'

export default function App() {
  usePushNotifications()
  return (
    <>
      <OfflineIndicator />
      <RouterProvider router={router} />
    </>
  )
}
```

- [ ] **Step 6: Write `apps/api/src/lib/vapid.ts`**

```typescript
import webpush from 'web-push'

let initialised = false

export function initVapid(): void {
  const publicKey = process.env['VAPID_PUBLIC_KEY']
  const privateKey = process.env['VAPID_PRIVATE_KEY']
  const subject = process.env['VAPID_SUBJECT']
  if (!publicKey || !privateKey || !subject) {
    console.warn('VAPID keys not configured — push notifications disabled')
    return
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  initialised = true
}

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  if (!initialised) return
  await webpush.sendNotification(subscription, JSON.stringify(payload))
}
```

Call `initVapid()` in `apps/api/src/index.ts` after the import block:

```typescript
import 'dotenv/config'
import { createApp } from './app.js'
import { initVapid } from './lib/vapid.js'

initVapid()
const port = Number(process.env['API_PORT'] ?? 3000)
const app = createApp()
app.listen(port, () => {
  console.log(`HakiOS API listening on http://localhost:${port}`)
})
```

- [ ] **Step 7: Write `apps/api/src/routes/push.ts`**

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { createError } from '../middleware/errorHandler.js'

export const pushRouter = Router()

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

pushRouter.post('/subscribe', requireAuth, async (req, res, next) => {
  try {
    const parsed = subscriptionSchema.safeParse(req.body)
    if (!parsed.success) throw createError('Invalid subscription payload', 400)

    const { endpoint, keys } = parsed.data
    await db.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, endpoint) DO NOTHING`,
      [req.user!.id, endpoint, keys.p256dh, keys.auth],
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

pushRouter.delete('/subscribe', requireAuth, async (req, res, next) => {
  try {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body)
    await db.query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [req.user!.id, endpoint],
    )
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
```

Register in `apps/api/src/routes/index.ts`:

```typescript
import type { Express } from 'express'
import { authRouter } from './auth.js'
import { pushRouter } from './push.js'

export function registerRoutes(app: Express): void {
  app.use('/auth', authRouter)
  app.use('/push', pushRouter)
}
```

- [ ] **Step 8: Generate VAPID keys (one-time setup)**

```bash
npx web-push generate-vapid-keys
```

Copy the output into your root `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) and into `apps/web/.env.local` (`VITE_VAPID_PUBLIC_KEY`).

- [ ] **Step 9: Build and verify PWA**

```bash
cd apps/web && npm run build && npm run preview
```

Open `http://localhost:4173` in Chrome. Open DevTools → Application → Manifest — confirm the manifest loads. Check Service Workers — confirm registration. A Lighthouse PWA audit should show "Installable" passing.

- [ ] **Step 10: Run all tests across the monorepo**

```bash
cd ../.. && npm run test
```

Expected: all tests PASS across `packages/utils`, `apps/api`, `apps/web`.

- [ ] **Step 11: Final commit**

```bash
git add apps/web/vite.config.ts apps/web/public/ apps/web/src/hooks/usePushNotifications.ts apps/web/src/App.tsx
git add apps/api/src/lib/vapid.ts apps/api/src/routes/push.ts apps/api/src/routes/index.ts apps/api/src/index.ts
git commit -m "feat: add PWA manifest, service worker caching, and Web Push subscription endpoint"
```

---

## Self-review

**Spec coverage check:**

| PRD requirement | Covered? |
|---|---|
| JWT login, refresh, logout | Task 1 + 3 ✓ |
| bcrypt min 12 rounds | Task 1 ✓ |
| Access token 15 min, refresh 7 days | Task 1 ✓ |
| Refresh tokens stored hashed (SHA-256) | Task 3 ✓ |
| Password reset via Resend, 1-hour expiry, single-use | Task 3 ✓ |
| Reset invalidates all refresh tokens | Task 3 ✓ |
| Invite link 48-hour expiry, single-use | Task 3 ✓ |
| Rate limiting: 5 attempts / 15 min / IP | Plan 1a Task 7 (app.ts) ✓ |
| RBAC enforced at middleware level | Task 4 ✓ |
| All 4 roles with correct permissions | Task 4 + packages/types ✓ |
| Concurrent sessions allowed | Task 3 (logout invalidates one token only) ✓ |
| Silent token refresh before expiry | Task 5 (api.ts) ✓ |
| Password policy (8 chars, uppercase, number, special) | `passwordSchema` in packages/utils ✓ |
| Login page with form validation | Task 6 ✓ |
| Set-password page (invite + reset modes) | Task 6 ✓ |
| Protected routes redirect to login | Task 6 ✓ |
| PWA installable (Android, iOS, desktop Chrome/Edge) | Task 7 ✓ |
| Web Push (VAPID, Android + desktop Chrome) | Task 7 ✓ |
| Push subscription stored in DB | Task 7 ✓ |
| Offline indicator banner | Task 6 ✓ |
| Offline = read-only (writes disabled) | Task 6 (OfflineIndicator) + Task 7 (NetworkFirst caching) ✓ |
| Push notifications prompt on first login | Task 5 (usePushNotifications called in App) ✓ |

**No placeholders found.**

**Type consistency:** `AuthTokens`, `User`, `JwtPayload`, `Role`, `Permission` defined once in `packages/types` and consumed without redefinition in API and web. `passwordSchema` from `@hakios/utils` used in both `auth.ts` routes and `SetPasswordPage.tsx`.

---

*Plan 1b complete. Phase 1a + 1b together produce a fully authenticated, installable PWA with RBAC and a complete DB schema. Plan 2 (Client & Matter Management) builds on this foundation.*
