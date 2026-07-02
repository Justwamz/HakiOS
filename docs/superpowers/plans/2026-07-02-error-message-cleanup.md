# Plain-English Error Message Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace jargon-heavy or generic error messages across the existing API (`VALIDATION_ERROR`, `Forbidden`, `Invalid request body`, raw Zod messages, etc.) with plain English a non-technical law-firm staff member can act on, so that when someone contacts support about an error, exactly what went wrong is obvious from the message itself.

**Architecture:** A new shared helper (`apps/api/src/lib/friendlyError.ts`) turns any Zod validation failure into a plain-English sentence based on the failing field, replacing one-off `result.error.errors[0]?.message ?? 'Validation error'` fallbacks scattered across five route files. Everywhere else (permission checks, not-found/conflict cases, auth token errors), the fix is a direct string replacement — no new abstraction needed since these aren't derived from Zod.

**Tech Stack:** TypeScript 5 strict, Zod, Express 4, Vitest + Supertest — no new dependencies.

## Global Constraints

- Every message must read like something you'd say out loud to a non-technical staff member explaining what to do next — never a field name in camelCase, an HTTP-status word, or a raw Zod message
- `apps/api/src/services/auth.ts`'s `'Invalid email or password'` (login failure) stays exactly as-is — it's intentionally non-specific for security (doesn't reveal whether the email exists)
- This plan only touches backend error strings. No existing test in the repo asserts on any of the old strings being replaced (verified by grep before writing this plan), so no test files need their assertions updated — only new assertions are added where noted
- Push to `origin/master` after every commit to trigger Render deployment
- This plan is independent of `2026-07-02-document-templates.md` and can run before, after, or interleaved with it — the only shared file is `apps/api/src/routes/settings.ts`, and Task 5 here only touches routes below the `GET /` handler, which the templates plan explicitly leaves untouched

---

### Task 1: Shared friendly-validation helper, auth routes, and middleware

**Files:**
- Create: `apps/api/src/lib/friendlyError.ts`
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/middleware/requireAuth.ts`
- Modify: `apps/api/src/middleware/requireRole.ts`
- Modify: `apps/api/src/middleware/errorHandler.ts`
- Test: `apps/api/src/__tests__/friendlyError.test.ts`

**Interfaces:**
- Produces: `friendlyZodMessage(error: ZodError): string` — exported from `apps/api/src/lib/friendlyError.ts`, consumed by Tasks 3, 4, 5

- [ ] **Step 1: Write the failing test for the helper**

Create `apps/api/src/__tests__/friendlyError.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { friendlyZodMessage } from '../lib/friendlyError.js'

describe('friendlyZodMessage', () => {
  it('gives a plain-English message for an invalid email', () => {
    const result = z.object({ email: z.string().email() }).safeParse({ email: 'not-an-email' })
    if (result.success) throw new Error('expected failure')
    expect(friendlyZodMessage(result.error)).toBe('Please enter a valid email address.')
  })

  it('gives a plain-English message for a missing required field', () => {
    const result = z.object({ firstName: z.string().min(1) }).safeParse({ firstName: '' })
    if (result.success) throw new Error('expected failure')
    expect(friendlyZodMessage(result.error)).toBe('Please fill in the first name.')
  })

  it('falls back to a generic message for an unmapped field', () => {
    const result = z.object({ somethingObscure: z.string().min(1) }).safeParse({ somethingObscure: '' })
    if (result.success) throw new Error('expected failure')
    expect(friendlyZodMessage(result.error)).toBe('Please fill in the somethingObscure.')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd apps/api && npm run test -- friendlyError
```

Expected: `Cannot find module '../lib/friendlyError.js'`.

- [ ] **Step 3: Create `apps/api/src/lib/friendlyError.ts`**

```typescript
import type { ZodError } from 'zod'

const FIELD_LABELS: Record<string, string> = {
  email: 'email address',
  password: 'password',
  firstName: 'first name',
  lastName: 'last name',
  fullName: 'name',
  phone: 'phone number',
  refreshToken: 'session',
  token: 'link',
  changeNote: 'change note',
  category: 'category',
  name: 'name',
  description: 'description',
  matterId: 'matter',
  clientId: 'client',
  eventType: 'event type',
  date: 'date',
  time: 'time',
}

export function friendlyZodMessage(error: ZodError): string {
  const issue = error.errors[0]
  if (!issue) return 'Please check what you entered and try again.'

  const fieldKey = issue.path.length > 0 ? String(issue.path[0]) : null
  const field = fieldKey ? (FIELD_LABELS[fieldKey] ?? fieldKey) : null

  if (issue.code === 'invalid_string' && 'validation' in issue && issue.validation === 'email') {
    return 'Please enter a valid email address.'
  }
  if (issue.code === 'too_small' || issue.code === 'invalid_type') {
    return field ? `Please fill in the ${field}.` : 'Please fill in the required fields.'
  }
  return field ? `Please enter a valid ${field}.` : 'Please check what you entered and try again.'
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd apps/api && npm run test -- friendlyError
```

Expected: PASS.

- [ ] **Step 5: Update `apps/api/src/routes/auth.ts`**

Replace:

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
  if (!result.success) {
    throw createError(result.error.errors[0]?.message ?? 'Validation error', 400, 'VALIDATION_ERROR')
  }
  return result.data
}
```

with:

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { emailSchema, passwordSchema } from '@hakios/utils'
import * as authService from '../services/auth.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { createError } from '../middleware/errorHandler.js'
import { friendlyZodMessage } from '../lib/friendlyError.js'

export const authRouter = Router()

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw createError(friendlyZodMessage(result.error), 400, 'VALIDATION_ERROR')
  }
  return result.data
}
```

Everything else in `auth.ts` is unchanged.

- [ ] **Step 6: Update `apps/api/src/middleware/requireAuth.ts`**

Replace the file contents:

```typescript
import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../lib/jwt.js'
import { createError } from './errorHandler.js'

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers['authorization']
  if (!header?.startsWith('Bearer ')) {
    return next(createError('Please sign in to continue.', 401, 'UNAUTHENTICATED'))
  }

  const token = header.slice(7)
  try {
    const payload = verifyAccessToken(token)
    req.user = { id: payload.sub, role: payload.role }
    next()
  } catch {
    next(createError('Your session has expired. Please sign in again.', 401, 'INVALID_TOKEN'))
  }
}
```

- [ ] **Step 7: Update `apps/api/src/middleware/requireRole.ts`**

Replace the file contents:

```typescript
import type { Request, Response, NextFunction } from 'express'
import { hasPermission } from '@hakios/types'
import type { Permission } from '@hakios/types'
import { createError } from './errorHandler.js'

export function requireRole(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(createError('Please sign in to continue.', 401, 'UNAUTHENTICATED'))
    }
    const allowed = permissions.every((p) => hasPermission(req.user!.role, p))
    if (!allowed) {
      return next(createError('You don’t have permission to do this. Please contact your administrator.', 403, 'FORBIDDEN'))
    }
    next()
  }
}
```

- [ ] **Step 8: Update `apps/api/src/middleware/errorHandler.ts`**

Replace the file contents:

```typescript
import type { Request, Response, NextFunction } from 'express'

export interface AppError extends Error {
  statusCode?: number
  code?: string
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500
  const message = statusCode < 500
    ? err.message
    : 'Something went wrong on our end. Please try again, and contact support if it keeps happening.'

  if (statusCode >= 500) {
    console.error(err)
  }

  res.status(statusCode).json({ error: message, code: err.code })
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'We couldn’t find what you were looking for. Please refresh the page and try again.' })
}

export function createError(message: string, statusCode: number, code?: string): AppError {
  const err: AppError = new Error(message)
  err.statusCode = statusCode
  err.code = code
  return err
}
```

- [ ] **Step 9: Run the full test suite for these files**

```bash
cd apps/api && npm run test -- auth
```

Expected: PASS (given a live DB), no new failures introduced by the message changes (confirmed no existing test asserts on the old strings).

- [ ] **Step 10: Run typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: 0 errors.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/lib/friendlyError.ts apps/api/src/__tests__/friendlyError.test.ts apps/api/src/routes/auth.ts apps/api/src/middleware/requireAuth.ts apps/api/src/middleware/requireRole.ts apps/api/src/middleware/errorHandler.ts
git commit -m "fix: plain-English auth, permission, and validation error messages"
git push origin master
```

---

### Task 2: Auth service token messages

**Files:**
- Modify: `apps/api/src/services/auth.ts`

- [ ] **Step 1: Update the five token-related error messages**

In `apps/api/src/services/auth.ts`, make five replacements (leave every other line in the file untouched):

Replace:
```typescript
    throw createError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN')
```
with:
```typescript
    throw createError('Your session has expired. Please sign in again.', 401, 'INVALID_REFRESH_TOKEN')
```

Replace:
```typescript
  if (rows.length === 0) throw createError('Refresh token not found', 401, 'INVALID_REFRESH_TOKEN')
```
with:
```typescript
  if (rows.length === 0) throw createError('Your session has expired. Please sign in again.', 401, 'INVALID_REFRESH_TOKEN')
```

Replace:
```typescript
  if (!userRow) throw createError('User not found', 401, 'INVALID_REFRESH_TOKEN')
```
with:
```typescript
  if (!userRow) throw createError('Your session has expired. Please sign in again.', 401, 'INVALID_REFRESH_TOKEN')
```

Replace:
```typescript
    if (!row) throw createError('Invalid or expired reset token', 400, 'INVALID_RESET_TOKEN')
```
with:
```typescript
    if (!row) throw createError('This password reset link has expired or is invalid. Please request a new one.', 400, 'INVALID_RESET_TOKEN')
```

Replace:
```typescript
    if (!row) throw createError('Invalid or expired invite token', 400, 'INVALID_INVITE_TOKEN')
```
with:
```typescript
    if (!row) throw createError('This invitation link has expired or is invalid. Please contact your administrator for a new invite.', 400, 'INVALID_INVITE_TOKEN')
```

Leave the two `'Invalid email or password'` messages in the `login` function exactly as they are — do not change them.

- [ ] **Step 2: Run tests**

```bash
cd apps/api && npm run test -- auth
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/auth.ts
git commit -m "fix: plain-English auth token expiry messages"
git push origin master
```

---

### Task 3: Clients, Matters, and Push routes

**Files:**
- Modify: `apps/api/src/routes/clients.ts`
- Modify: `apps/api/src/routes/matters.ts`
- Modify: `apps/api/src/services/matters.ts`
- Modify: `apps/api/src/routes/push.ts`

**Interfaces:**
- Consumes: `friendlyZodMessage` from `../lib/friendlyError.js` (Task 1)

- [ ] **Step 1: Update `apps/api/src/routes/clients.ts`**

Add the import — replace:

```typescript
import { createError } from '../middleware/errorHandler.js'
import * as clientsService from '../services/clients.js'
```

with:

```typescript
import { createError } from '../middleware/errorHandler.js'
import { friendlyZodMessage } from '../lib/friendlyError.js'
import * as clientsService from '../services/clients.js'
```

Then make these replacements (each string appears once in the file):

Replace `createError('Authentication required', 401, 'UNAUTHENTICATED')` (all 3 occurrences) with `createError('Please sign in to continue.', 401, 'UNAUTHENTICATED')`.

Replace `createError('Insufficient permissions', 403, 'FORBIDDEN')` (all 3 occurrences) with `createError('You don’t have permission to do this. Please contact your administrator.', 403, 'FORBIDDEN')`.

Replace:
```typescript
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) return next(createError('Invalid query parameters', 400))
```
with:
```typescript
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) return next(createError(friendlyZodMessage(parsed.error), 400, 'VALIDATION_ERROR'))
```

Replace both occurrences of:
```typescript
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return next(createError('Invalid request body', 400))
```
and
```typescript
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) return next(createError('Invalid request body', 400))
```
with the same pattern (keep the correct schema variable name in each case):
```typescript
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return next(createError(friendlyZodMessage(parsed.error), 400, 'VALIDATION_ERROR'))
```
```typescript
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) return next(createError(friendlyZodMessage(parsed.error), 400, 'VALIDATION_ERROR'))
```

Replace both occurrences of `createError('Missing id', 400, 'BAD_REQUEST')` with `createError('We couldn’t find what you were looking for. Please refresh the page and try again.', 400, 'BAD_REQUEST')`.

- [ ] **Step 2: Update `apps/api/src/routes/matters.ts`**

Add the import — replace:

```typescript
import { createError } from '../middleware/errorHandler.js'
import * as mattersService from '../services/matters.js'
```

with:

```typescript
import { createError } from '../middleware/errorHandler.js'
import { friendlyZodMessage } from '../lib/friendlyError.js'
import * as mattersService from '../services/matters.js'
```

Replace all 4 occurrences of `createError('Unauthorized', 401, 'UNAUTHORIZED')` with `createError('Please sign in to continue.', 401, 'UNAUTHORIZED')`.

Replace the 1 occurrence of `createError('Insufficient permissions', 403, 'FORBIDDEN')` with `createError('You don’t have permission to do this. Please contact your administrator.', 403, 'FORBIDDEN')`.

Replace:
```typescript
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) return next(createError('Invalid query parameters', 400))
```
with:
```typescript
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) return next(createError(friendlyZodMessage(parsed.error), 400, 'VALIDATION_ERROR'))
```

Replace each of the four `if (!parsed.success) return next(createError('Invalid request body', 400))` occurrences (in the `POST /`, `PUT /:id`, and `POST /:id/close` handlers) with `if (!parsed.success) return next(createError(friendlyZodMessage(parsed.error), 400, 'VALIDATION_ERROR'))` — keep each occurrence's preceding `const parsed = ...Schema.safeParse(req.body)` line exactly as it already is (they use different schema variables — `createSchema`, `updateSchema`, `closeSchema` — only the `createError(...)` line inside each block changes).

Replace all 4 occurrences of `createError('Missing id', 400, 'BAD_REQUEST')` with `createError('We couldn’t find what you were looking for. Please refresh the page and try again.', 400, 'BAD_REQUEST')`.

Replace:
```typescript
    if (current.status === 'closed') {
      return next(createError('Cannot edit a closed matter', 400, 'MATTER_CLOSED'))
    }
```
with:
```typescript
    if (current.status === 'closed') {
      return next(createError('This matter has already been closed and can’t be edited.', 400, 'MATTER_CLOSED'))
    }
```

- [ ] **Step 3: Update `apps/api/src/services/matters.ts`**

Replace:
```typescript
  if (!rows[0]) throw createError('Case number settings not configured', 500)
```
with:
```typescript
  if (!rows[0]) throw createError('Case numbering hasn’t been set up yet. Ask an admin to set it up in Settings before creating a matter.', 500)
```

- [ ] **Step 4: Update `apps/api/src/routes/push.ts`**

Replace:

```typescript
import { requireAuth } from '../middleware/requireAuth.js'
import { createError } from '../middleware/errorHandler.js'
```

with:

```typescript
import { requireAuth } from '../middleware/requireAuth.js'
import { createError } from '../middleware/errorHandler.js'
import { friendlyZodMessage } from '../lib/friendlyError.js'
```

Replace:
```typescript
    const parsed = subscriptionSchema.safeParse(req.body)
    if (!parsed.success) throw createError('Invalid subscription payload', 400)
```
with:
```typescript
    const parsed = subscriptionSchema.safeParse(req.body)
    if (!parsed.success) throw createError(friendlyZodMessage(parsed.error), 400, 'VALIDATION_ERROR')
```

Replace:
```typescript
    const parsed = z.object({ endpoint: z.string().url() }).safeParse(req.body)
    if (!parsed.success) throw createError('Invalid request body', 400)
```
with:
```typescript
    const parsed = z.object({ endpoint: z.string().url() }).safeParse(req.body)
    if (!parsed.success) throw createError(friendlyZodMessage(parsed.error), 400, 'VALIDATION_ERROR')
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && npm run test -- clients matters push
```

Expected: PASS.

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/clients.ts apps/api/src/routes/matters.ts apps/api/src/services/matters.ts apps/api/src/routes/push.ts
git commit -m "fix: plain-English error messages for clients, matters, and push routes"
git push origin master
```

---

### Task 4: Calendar routes

**Files:**
- Modify: `apps/api/src/routes/calendar.ts`

**Interfaces:**
- Consumes: `friendlyZodMessage` from `../lib/friendlyError.js` (Task 1)

- [ ] **Step 1: Add the import**

Replace:

```typescript
import { createError } from '../middleware/errorHandler.js'
import { hasPermission } from '@hakios/types'
```

with:

```typescript
import { createError } from '../middleware/errorHandler.js'
import { friendlyZodMessage } from '../lib/friendlyError.js'
import { hasPermission } from '@hakios/types'
```

- [ ] **Step 2: Replace the five `'Forbidden'` messages**

All five occurrences of `createError('Forbidden', 403, 'FORBIDDEN')` become `createError('You don’t have permission to do this. Please contact your administrator.', 403, 'FORBIDDEN')`.

- [ ] **Step 3: Replace the two Zod validation fallbacks**

Replace:
```typescript
    const result = createSchema.safeParse(req.body)
    if (!result.success) {
      return next(
        createError(result.error.errors[0]?.message ?? 'Validation error', 400, 'VALIDATION_ERROR'),
      )
    }
```
with:
```typescript
    const result = createSchema.safeParse(req.body)
    if (!result.success) {
      return next(createError(friendlyZodMessage(result.error), 400, 'VALIDATION_ERROR'))
    }
```

Replace:
```typescript
    const result = updateSchema.safeParse(req.body)
    if (!result.success) {
      return next(
        createError(result.error.errors[0]?.message ?? 'Validation error', 400, 'VALIDATION_ERROR'),
      )
    }
```
with:
```typescript
    const result = updateSchema.safeParse(req.body)
    if (!result.success) {
      return next(createError(friendlyZodMessage(result.error), 400, 'VALIDATION_ERROR'))
    }
```

- [ ] **Step 4: Replace the resolved-event message**

Replace:
```typescript
    if (current.isResolved) {
      return next(createError('Cannot edit a resolved event', 400, 'EVENT_RESOLVED'))
    }
```
with:
```typescript
    if (current.isResolved) {
      return next(createError('This event has already been marked resolved and can’t be edited.', 400, 'EVENT_RESOLVED'))
    }
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && npm run test -- calendar
```

Expected: PASS.

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/calendar.ts
git commit -m "fix: plain-English error messages for calendar routes"
git push origin master
```

---

### Task 5: Settings and Users routes

**Files:**
- Modify: `apps/api/src/routes/settings.ts`
- Modify: `apps/api/src/routes/users.ts`

**Interfaces:**
- Consumes: `friendlyZodMessage` from `../lib/friendlyError.js` (Task 1)

- [ ] **Step 1: Add the import to `settings.ts`**

Find the existing `import { createError } from '../middleware/errorHandler.js'` line in `apps/api/src/routes/settings.ts` and add directly below it:

```typescript
import { friendlyZodMessage } from '../lib/friendlyError.js'
```

(If the document-templates plan's Task 3 has already run and restructured the top of this file, this import still belongs in the same place — right after the `createError` import.)

- [ ] **Step 2: Replace the four Zod validation fallbacks in `settings.ts`**

Each of the four occurrences follows the same shape — `const result = <schema>.safeParse(req.body)` (schema names: `firmSchema`, `caseNumberSchema`, `matterTypeSchema`, `reminderScheduleSchema`) followed by:

```typescript
    if (!result.success) {
      return next(createError(result.error.errors[0]?.message ?? 'Validation error', 400, 'VALIDATION_ERROR'))
    }
```

(the `reminder-schedules` occurrence is formatted slightly differently, spanning three lines instead of one for the `createError` call — both formattings are replaced the same way). Replace all four with:

```typescript
    if (!result.success) {
      return next(createError(friendlyZodMessage(result.error), 400, 'VALIDATION_ERROR'))
    }
```

- [ ] **Step 3: Replace the matter-type code regex message in `settings.ts`**

Replace:
```typescript
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/, 'Code must be uppercase letters, digits, or underscores'),
```
with:
```typescript
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/, 'The matter type code can only use capital letters, numbers, and underscores (e.g. LIT_2024).'),
```

- [ ] **Step 4: Update `apps/api/src/routes/users.ts`**

Add the import — replace:

```typescript
import { createError } from '../middleware/errorHandler.js'
import { emailSchema } from '@hakios/utils'
```

with:

```typescript
import { createError } from '../middleware/errorHandler.js'
import { friendlyZodMessage } from '../lib/friendlyError.js'
import { emailSchema } from '@hakios/utils'
```

Replace:
```typescript
    const result = bodySchema.safeParse(req.body)
    if (!result.success) {
      return next(createError(result.error.errors[0]?.message ?? 'Validation error', 400, 'VALIDATION_ERROR'))
    }
    const { email, firstName, lastName, role } = result.data
```
with:
```typescript
    const result = bodySchema.safeParse(req.body)
    if (!result.success) {
      return next(createError(friendlyZodMessage(result.error), 400, 'VALIDATION_ERROR'))
    }
    const { email, firstName, lastName, role } = result.data
```

Replace:
```typescript
    if (!result.success) {
      return next(createError('isActive must be a boolean', 400, 'VALIDATION_ERROR'))
    }
```
with:
```typescript
    if (!result.success) {
      return next(createError('Something went wrong updating the status. Please try again.', 400, 'VALIDATION_ERROR'))
    }
```

Replace:
```typescript
    if (req.params['id'] === req.user!.id && !isActive) {
      return next(createError('Cannot deactivate your own account', 400, 'BAD_REQUEST'))
    }
```
with:
```typescript
    if (req.params['id'] === req.user!.id && !isActive) {
      return next(createError('You can’t deactivate your own account. Ask another admin to do this if needed.', 400, 'BAD_REQUEST'))
    }
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && npm run test -- settings users
```

Expected: PASS.

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/settings.ts apps/api/src/routes/users.ts
git commit -m "fix: plain-English error messages for settings and users routes"
git push origin master
```

---

### Task 6: Frontend fallback text and end-to-end verification

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Update the frontend fallback error text**

In `apps/web/src/lib/api.ts`, replace:

```typescript
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string }
    const err = new Error(body.error ?? 'Request failed') as Error & { status: number }
    err.status = res.status
    throw err
  }
```

with:

```typescript
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Something went wrong. Please check your connection and try again.' })) as { error?: string }
    const err = new Error(body.error ?? 'Something went wrong. Please check your connection and try again.') as Error & { status: number }
    err.status = res.status
    throw err
  }
```

This is the only change in the file — leave the rest (including any `FormData` handling the document-templates plan may already have added to the header logic above this block) untouched.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck --workspace=apps/web
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "fix: plain-English fallback error text on the frontend"
git push origin master
```

- [ ] **Step 4: Run the full backend test suite**

```bash
npm run test --workspace=apps/api
```

Expected: all tests pass, given a live DB.

- [ ] **Step 5: Manually spot-check a few error paths in the browser**

Using the `/run` skill or `npm run dev`: try creating a client with an invalid email, try deactivating your own admin account from the Users page, and try submitting a matter-type code with lowercase letters in Settings. Confirm each shows a plain-English message rather than the old jargon (e.g. no more `isActive must be a boolean` or `Cannot deactivate your own account`-style terse phrasing).
