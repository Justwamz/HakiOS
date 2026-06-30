# HakiOS Phase 1a — Monorepo Scaffold, Shared Packages & Database

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Turborepo monorepo with all shared packages, the complete PostgreSQL schema, and a running Express API shell with a health endpoint — the foundation every subsequent plan builds on.

**Architecture:** npm workspaces + Turborepo monorepo. Shared packages (`@hakios/types`, `@hakios/utils`, `@hakios/ui`, `@hakios/email`) are built first so the API can import them. The full DB schema (all tables for all Phase 1 modules, plus the Phase 2 Cloudflare R2 documents stub) is created in a single migration so the data model is coherent from day one. The Express app uses a factory function (`createApp()`) so it can be imported by tests without binding to a port.

**Tech Stack:** Turborepo 2, npm workspaces, TypeScript 5 (strict), Node.js 20, Express 4, `pg` 8, Zod 3, `react-email` + `@react-email/components`, Vitest 1, Supertest 7

## Global Constraints

- Node.js ≥ 20.x required
- Package manager: **npm** (npm workspaces) — not pnpm, not yarn
- Workspace protocol: `"@hakios/types": "*"` in all inter-package imports
- TypeScript strict mode everywhere — `"strict": true`, no `any` without explicit `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
- All timestamps stored in UTC; display in EAT (Africa/Nairobi, UTC+3)
- Cloudflare R2 env vars included in `.env.example` from day one (no upload logic in Phase 1 — vars only)
- ESLint + Prettier enforced at root via Turborepo lint pipeline
- Vitest for all tests (not Jest)
- Database migrations in `apps/api/src/db/migrations/` — plain `.sql` files, run by a Node migration runner
- No ORM — raw `pg` queries throughout

---

## File map

```
hakios/                               ← new monorepo root (create this directory)
├── apps/
│   └── api/
│       ├── src/
│       │   ├── app.ts                create — Express app factory
│       │   ├── index.ts              create — server entry point
│       │   ├── middleware/
│       │   │   └── errorHandler.ts   create — global error handler
│       │   └── db/
│       │       ├── client.ts         create — pg Pool singleton
│       │       ├── migrate.ts        create — migration runner CLI
│       │       └── migrations/
│       │           ├── 001_initial.sql  create — full schema
│       │           └── 002_seed.sql     create — default data
│       ├── package.json              create
│       ├── tsconfig.json             create
│       └── vitest.config.ts          create
├── packages/
│   ├── types/
│   │   ├── src/
│   │   │   ├── user.ts               create
│   │   │   ├── client.ts             create
│   │   │   ├── matter.ts             create
│   │   │   ├── calendar.ts           create
│   │   │   ├── notification.ts       create
│   │   │   ├── audit.ts              create
│   │   │   ├── settings.ts           create
│   │   │   ├── permissions.ts        create
│   │   │   └── index.ts              create
│   │   ├── package.json              create
│   │   └── tsconfig.json             create
│   ├── utils/
│   │   ├── src/
│   │   │   ├── caseNumber.ts         create
│   │   │   ├── dates.ts              create
│   │   │   ├── validation.ts         create
│   │   │   └── index.ts              create
│   │   ├── src/__tests__/
│   │   │   ├── caseNumber.test.ts    create
│   │   │   └── dates.test.ts         create
│   │   ├── package.json              create
│   │   ├── tsconfig.json             create
│   │   └── vitest.config.ts          create
│   ├── ui/
│   │   ├── tailwind.config.ts        create
│   │   ├── src/
│   │   │   └── globals.css           create
│   │   └── package.json              create
│   └── email/
│       ├── src/
│       │   ├── invite.tsx            create
│       │   ├── reset.tsx             create
│       │   ├── reminder.tsx          create
│       │   ├── escalation.tsx        create
│       │   └── index.ts              create
│       ├── package.json              create
│       └── tsconfig.json             create
├── tsconfig.base.json                create
├── package.json                      create
├── turbo.json                        create
├── .env.example                      create
├── .gitignore                        create
├── .eslintrc.cjs                     create
└── .prettierrc                       create
```

---

## Task 1: Monorepo root scaffold

**Files:**
- Create: `hakios/package.json`
- Create: `hakios/turbo.json`
- Create: `hakios/tsconfig.base.json`
- Create: `hakios/.env.example`
- Create: `hakios/.gitignore`
- Create: `hakios/.eslintrc.cjs`
- Create: `hakios/.prettierrc`

**Interfaces:**
- Consumes: nothing
- Produces: npm workspace root that all packages reference; `tsconfig.base.json` extended by every package

- [ ] **Step 1: Create the monorepo root directory and initialise**

```bash
mkdir hakios && cd hakios
npm init -y
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "hakios",
  "version": "0.0.0",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\" --ignore-path .gitignore"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "eslint": "^8.57.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint-config-prettier": "^9.1.0",
    "prettier": "^3.2.5"
  }
}
```

- [ ] **Step 3: Write `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    }
  }
}
```

- [ ] **Step 4: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true
  }
}
```

- [ ] **Step 5: Write `.env.example`**

```
# ── Database ───────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://hakios:hakios@localhost:5432/hakios

# ── JWT ────────────────────────────────────────────────────────────────────
JWT_SECRET=change-me-min-32-characters-long-secret
JWT_REFRESH_SECRET=change-me-different-min-32-characters

# ── Email (Resend) ──────────────────────────────────────────────────────────
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx

# ── PWA Push (VAPID) ────────────────────────────────────────────────────────
# Generate with: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@yourfirm.co.ke

# ── App ────────────────────────────────────────────────────────────────────
APP_URL=http://localhost:5173
API_PORT=3000
NODE_ENV=development

# ── Cloudflare R2 (Phase 2 — document storage) ──────────────────────────────
# Leave blank until Phase 2; vars are documented here for future setup
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=hakios-documents
CLOUDFLARE_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
```

- [ ] **Step 6: Write `.gitignore`**

```
node_modules/
dist/
.env
.env.local
.env.*.local
*.log
.turbo/
coverage/
.DS_Store
```

- [ ] **Step 7: Write `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
  },
  env: { node: true, es2022: true },
}
```

- [ ] **Step 8: Write `.prettierrc`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 9: Create empty app/package directory stubs**

```bash
mkdir -p apps/api/src/db/migrations
mkdir -p apps/web/src
mkdir -p packages/types/src
mkdir -p packages/utils/src/__tests__
mkdir -p packages/ui/src
mkdir -p packages/email/src
```

- [ ] **Step 10: Install root dependencies**

```bash
npm install
```

Expected: `node_modules/` created at root, `turbo` available.

- [ ] **Step 11: Commit**

```bash
git init
git add package.json turbo.json tsconfig.base.json .env.example .gitignore .eslintrc.cjs .prettierrc
git commit -m "chore: initialise hakios turborepo monorepo"
```

---

## Task 2: `packages/types` — shared TypeScript interfaces

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/user.ts`
- Create: `packages/types/src/client.ts`
- Create: `packages/types/src/matter.ts`
- Create: `packages/types/src/calendar.ts`
- Create: `packages/types/src/notification.ts`
- Create: `packages/types/src/audit.ts`
- Create: `packages/types/src/settings.ts`
- Create: `packages/types/src/permissions.ts`
- Create: `packages/types/src/index.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `@hakios/types` — all domain types imported by every other package and app

- [ ] **Step 1: Write `packages/types/package.json`**

```json
{
  "name": "@hakios/types",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "*"
  }
}
```

- [ ] **Step 2: Write `packages/types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `packages/types/src/user.ts`**

```typescript
export type Role = 'admin' | 'partner' | 'associate' | 'clerk'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: Role
  isActive: boolean
  createdAt: string   // ISO 8601 UTC
  updatedAt: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface JwtPayload {
  sub: string   // user id
  role: Role
  iat?: number
  exp?: number
}
```

- [ ] **Step 4: Write `packages/types/src/client.ts`**

```typescript
export type ClientType = 'individual' | 'corporate'
export type ClientStatus = 'active' | 'dormant' | 'closed'

export interface Client {
  id: string
  clientId: string              // CLT-YYYY-NNNNN
  clientType: ClientType
  fullName: string
  idNumber: string | null
  contactPerson: string | null  // corporate only
  phone: string | null
  email: string | null
  postalAddress: string | null
  kraPin: string | null
  status: ClientStatus
  hasConflict: boolean
  conflictNotes: string | null
  internalNotes: string | null
  createdBy: string             // user id
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface CreateClientInput {
  clientType: ClientType
  fullName: string
  idNumber?: string
  contactPerson?: string
  phone?: string
  email?: string
  postalAddress?: string
  kraPin?: string
  hasConflict?: boolean
  conflictNotes?: string
  internalNotes?: string
}

export type UpdateClientInput = Partial<Omit<CreateClientInput, 'clientType'>> & {
  status?: ClientStatus
}
```

- [ ] **Step 5: Write `packages/types/src/matter.ts`**

```typescript
export type MatterStatus =
  | 'active'
  | 'pending'
  | 'adjourned'
  | 'on_appeal'
  | 'settled'
  | 'closed'

export interface MatterTypeCode {
  code: string
  label: string
  isActive: boolean
  createdAt: string
}

export interface Matter {
  id: string
  matterNumber: string
  clientId: string
  matterType: string        // references MatterTypeCode.code
  description: string
  status: MatterStatus
  leadAdvocateId: string | null
  supervisingPartnerId: string | null
  clerkIds: string[]
  opposingParty: string | null
  opposingAdvocate: string | null
  courtName: string | null
  courtStation: string | null
  courtDivision: string | null
  courtFileNumber: string | null
  judge: string | null
  nextAction: string | null
  nextActionDue: string | null  // YYYY-MM-DD
  relatedMatterIds: string[]
  dateOpened: string            // YYYY-MM-DD
  dateClosed: string | null
  openedBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface MatterTimelineEntry {
  id: string
  matterId: string
  eventType: 'status_change' | 'assignment_change' | 'note' | 'event_linked' | 'closure'
  description: string
  createdBy: string
  createdAt: string
}

export interface CreateMatterInput {
  clientId: string
  matterType: string
  description: string
  leadAdvocateId?: string
  supervisingPartnerId?: string
  clerkIds?: string[]
  opposingParty?: string
  opposingAdvocate?: string
  courtName?: string
  courtStation?: string
  courtDivision?: string
  courtFileNumber?: string
  judge?: string
  nextAction?: string
  nextActionDue?: string
}
```

- [ ] **Step 6: Write `packages/types/src/calendar.ts`**

```typescript
export type EventType =
  | 'court_hearing'
  | 'filing_deadline'
  | 'submission_deadline'
  | 'mention'
  | 'client_meeting'
  | 'internal_review'

export type RecurrenceType = 'none' | 'weekly' | 'monthly' | 'custom'

export interface CalendarEvent {
  id: string
  eventType: EventType
  title: string
  matterId: string
  clientId: string              // inherited from matter
  date: string                  // YYYY-MM-DD
  time: string | null           // HH:MM
  assigneeIds: string[]
  supervisingPartnerId: string | null
  notes: string | null
  recurrence: RecurrenceType
  recurrenceParentId: string | null
  isResolved: boolean
  acknowledgedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CreateCalendarEventInput {
  eventType: EventType
  title: string
  matterId: string
  date: string
  time?: string
  assigneeIds?: string[]
  supervisingPartnerId?: string
  notes?: string
  recurrence?: RecurrenceType
}
```

- [ ] **Step 7: Write `packages/types/src/notification.ts`**

```typescript
export type NotificationType = 'reminder' | 'escalation' | 'overdue'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  matterId: string | null
  eventId: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

export interface WebPushSubscription {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  createdAt: string
}
```

- [ ] **Step 8: Write `packages/types/src/audit.ts`**

```typescript
export interface AuditLog {
  id: string
  userId: string | null
  action: string
  recordType: string
  recordId: string
  beforeValue: Record<string, unknown> | null
  afterValue: Record<string, unknown> | null
  createdAt: string
}
```

- [ ] **Step 9: Write `packages/types/src/settings.ts`**

```typescript
export interface CaseNumberSettings {
  firmPrefix: string            // max 6 chars, e.g. 'LF'
  includeTypeCode: boolean
  includeYear: boolean
  sequenceDigits: 4 | 5 | 6
  separator: '/' | '-' | '.'
}

export interface FirmProfile {
  firmName: string
  address: string
  phone: string
  email: string
}

export interface ReminderSchedule {
  id: string
  eventType: string
  daysBefore: number
}

export interface SystemSettings {
  caseNumber: CaseNumberSettings
  firm: FirmProfile
  emailDeliveryMode: 'realtime' | 'digest'
  digestSendTime: string        // HH:MM (EAT)
  escalationThresholdHours: number
}
```

- [ ] **Step 10: Write `packages/types/src/permissions.ts`**

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

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'clients:read_all', 'clients:create', 'clients:edit',
    'matters:read_all', 'matters:create', 'matters:edit', 'matters:close',
    'calendar:read_all', 'calendar:create',
    'users:manage', 'settings:manage',
    'audit:view', 'audit:export',
  ],
  partner: [
    'clients:read_all', 'clients:create', 'clients:edit',
    'matters:read_all', 'matters:create', 'matters:edit', 'matters:close',
    'calendar:read_all', 'calendar:create',
    'audit:view',
  ],
  associate: [
    'clients:read_assigned', 'clients:create', 'clients:edit',
    'matters:read_assigned', 'matters:create', 'matters:edit',
    'calendar:read_assigned', 'calendar:create',
  ],
  clerk: [
    'clients:read_assigned',
    'matters:read_assigned',
    'calendar:read_assigned', 'calendar:create',
  ],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}
```

- [ ] **Step 11: Write `packages/types/src/index.ts`**

```typescript
export * from './user.js'
export * from './client.js'
export * from './matter.js'
export * from './calendar.js'
export * from './notification.js'
export * from './audit.js'
export * from './settings.js'
export * from './permissions.js'
```

- [ ] **Step 12: Build and verify**

```bash
cd packages/types && npm run build
```

Expected: `packages/types/dist/` created with `.js` and `.d.ts` files, no TypeScript errors.

- [ ] **Step 13: Commit**

```bash
git add packages/types/
git commit -m "feat(types): add all shared domain interfaces"
```

---

## Task 3: `packages/utils` — shared utilities

**Files:**
- Create: `packages/utils/package.json`
- Create: `packages/utils/tsconfig.json`
- Create: `packages/utils/vitest.config.ts`
- Create: `packages/utils/src/caseNumber.ts`
- Create: `packages/utils/src/dates.ts`
- Create: `packages/utils/src/validation.ts`
- Create: `packages/utils/src/index.ts`
- Create: `packages/utils/src/__tests__/caseNumber.test.ts`
- Create: `packages/utils/src/__tests__/dates.test.ts`

**Interfaces:**
- Consumes: `@hakios/types` → `CaseNumberSettings`
- Produces: `generateClientId`, `generateMatterNumber`, `toEAT`, `addDays`, `daysBefore`, `toDateString`, `currentYear`, Zod schemas (`emailSchema`, `passwordSchema`, `phoneSchema`, `uuidSchema`, `paginationSchema`)

- [ ] **Step 1: Write `packages/utils/package.json`**

```json
{
  "name": "@hakios/utils",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@hakios/types": "*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "*",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Write `packages/utils/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "exclude": ["src/__tests__"]
}
```

- [ ] **Step 3: Write `packages/utils/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Write the failing tests first — `src/__tests__/caseNumber.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { generateClientId, generateMatterNumber } from '../caseNumber.js'
import type { CaseNumberSettings } from '@hakios/types'

const defaults: CaseNumberSettings = {
  firmPrefix: 'LF',
  includeTypeCode: true,
  includeYear: true,
  sequenceDigits: 5,
  separator: '/',
}

describe('generateClientId', () => {
  it('zero-pads sequence to 5 digits', () => {
    expect(generateClientId(2026, 1)).toBe('CLT-2026-00001')
  })

  it('handles large sequence numbers', () => {
    expect(generateClientId(2026, 142)).toBe('CLT-2026-00142')
  })
})

describe('generateMatterNumber', () => {
  it('generates default LF/LIT/2026/00142 format', () => {
    expect(generateMatterNumber(defaults, 'LIT', 2026, 142)).toBe('LF/LIT/2026/00142')
  })

  it('omits type code when toggled off', () => {
    const s: CaseNumberSettings = { ...defaults, includeTypeCode: false }
    expect(generateMatterNumber(s, 'LIT', 2026, 1)).toBe('LF/2026/00001')
  })

  it('omits year when toggled off', () => {
    const s: CaseNumberSettings = { ...defaults, includeYear: false }
    expect(generateMatterNumber(s, 'LIT', 2026, 1)).toBe('LF/LIT/00001')
  })

  it('omits both type and year', () => {
    const s: CaseNumberSettings = { ...defaults, includeTypeCode: false, includeYear: false }
    expect(generateMatterNumber(s, 'LIT', 2026, 1)).toBe('LF/00001')
  })

  it('uses dash separator', () => {
    const s: CaseNumberSettings = { ...defaults, separator: '-' }
    expect(generateMatterNumber(s, 'LIT', 2026, 1)).toBe('LF-LIT-2026-00001')
  })

  it('uses dot separator', () => {
    const s: CaseNumberSettings = { ...defaults, separator: '.' }
    expect(generateMatterNumber(s, 'LIT', 2026, 1)).toBe('LF.LIT.2026.00001')
  })

  it('respects 4-digit sequence setting', () => {
    const s: CaseNumberSettings = { ...defaults, sequenceDigits: 4 }
    expect(generateMatterNumber(s, 'LIT', 2026, 1)).toBe('LF/LIT/2026/0001')
  })

  it('respects 6-digit sequence setting', () => {
    const s: CaseNumberSettings = { ...defaults, sequenceDigits: 6 }
    expect(generateMatterNumber(s, 'LIT', 2026, 1)).toBe('LF/LIT/2026/000001')
  })
})
```

- [ ] **Step 5: Run tests — confirm they fail**

```bash
cd packages/utils && npm run test
```

Expected: FAIL — `caseNumber.ts` not found.

- [ ] **Step 6: Write `src/caseNumber.ts`**

```typescript
import type { CaseNumberSettings } from '@hakios/types'

export function generateClientId(year: number, seq: number): string {
  return `CLT-${year}-${String(seq).padStart(5, '0')}`
}

export function generateMatterNumber(
  settings: CaseNumberSettings,
  matterTypeCode: string,
  year: number,
  seq: number,
): string {
  const { firmPrefix, includeTypeCode, includeYear, sequenceDigits, separator } = settings
  const parts: string[] = [firmPrefix]
  if (includeTypeCode) parts.push(matterTypeCode)
  if (includeYear) parts.push(String(year))
  parts.push(String(seq).padStart(sequenceDigits, '0'))
  return parts.join(separator)
}
```

- [ ] **Step 7: Write failing tests — `src/__tests__/dates.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { addDays, daysBefore, toDateString } from '../dates.js'

describe('addDays', () => {
  it('adds positive days', () => {
    const d = new Date('2026-01-01T00:00:00Z')
    expect(toDateString(addDays(d, 7))).toBe('2026-01-08')
  })

  it('handles month boundary', () => {
    const d = new Date('2026-01-28T00:00:00Z')
    expect(toDateString(addDays(d, 5))).toBe('2026-02-02')
  })
})

describe('daysBefore', () => {
  it('subtracts days', () => {
    const d = new Date('2026-06-14T00:00:00Z')
    expect(toDateString(daysBefore(d, 7))).toBe('2026-06-07')
  })
})

describe('toDateString', () => {
  it('returns YYYY-MM-DD', () => {
    expect(toDateString(new Date('2026-06-29T15:30:00Z'))).toBe('2026-06-29')
  })
})
```

- [ ] **Step 8: Write `src/dates.ts`**

```typescript
export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function daysBefore(date: Date, n: number): Date {
  return addDays(date, -n)
}

export function toDateString(date: Date): string {
  return date.toISOString().split('T')[0] as string
}

export function toEAT(date: Date): Date {
  // EAT = UTC+3; returns a new Date adjusted for display
  return new Date(date.getTime() + 3 * 60 * 60 * 1000)
}

export function formatEAT(date: Date): string {
  return date.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })
}

export function currentYear(): number {
  return new Date().getUTCFullYear()
}
```

- [ ] **Step 9: Write `src/validation.ts`**

```typescript
import { z } from 'zod'

export const emailSchema = z.string().email('Invalid email address').toLowerCase()

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character')

export const phoneSchema = z
  .string()
  .regex(/^\+?[\d\s\-()]{7,20}$/, 'Invalid phone number')
  .optional()

export const uuidSchema = z.string().uuid('Invalid ID')

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})
```

- [ ] **Step 10: Write `src/index.ts`**

```typescript
export * from './caseNumber.js'
export * from './dates.js'
export * from './validation.js'
```

- [ ] **Step 11: Run tests — all pass**

```bash
npm run test
```

Expected: all 11 tests PASS.

- [ ] **Step 12: Build**

```bash
npm run build
```

Expected: `dist/` created, no errors.

- [ ] **Step 13: Commit**

```bash
cd ../..
git add packages/utils/
git commit -m "feat(utils): add case number generation, date helpers, Zod schemas"
```

---

## Task 4: `packages/ui` — Tailwind design system

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tailwind.config.ts`
- Create: `packages/ui/src/globals.css`

**Interfaces:**
- Consumes: nothing
- Produces: `@hakios/ui/tailwind.config` — extended by `apps/web` and any future app; brand colour tokens as CSS custom properties

- [ ] **Step 1: Write `packages/ui/package.json`**

```json
{
  "name": "@hakios/ui",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./tailwind.config": "./tailwind.config.ts",
    "./globals.css": "./src/globals.css"
  },
  "scripts": {
    "lint": "echo 'no lint for ui package'"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.0"
  }
}
```

- [ ] **Step 2: Write `packages/ui/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [],    // apps extend this and add their own content globs
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0a5c3e',
          light: '#2d7a4f',
        },
        accent: {
          DEFAULT: '#c49a28',
          light: '#e8c55a',
        },
        surface: '#ffffff',
        background: '#f7f5f0',
        'text-primary': '#1e1e1a',
        'text-secondary': '#4a4a45',
        'text-muted': '#8a8a82',
        border: '#e0ded8',
        status: {
          overdue: '#c0392b',
          urgent: '#d4820a',
          upcoming: '#1a6b9a',
          resolved: '#2d7a4f',
          neutral: '#8a8a82',
        },
        dark: {
          background: '#141412',
          surface: '#1e1e1a',
          'text-primary': '#f0ede6',
          'text-secondary': '#b0ada6',
          border: '#2e2e28',
          primary: '#1a8a5a',
          accent: '#d4aa3a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 3: Write `packages/ui/src/globals.css`**

```css
/* Brand tokens as CSS custom properties — consumed via Tailwind config */
:root {
  --color-primary: #0a5c3e;
  --color-primary-light: #2d7a4f;
  --color-accent: #c49a28;
  --color-accent-light: #e8c55a;
  --color-background: #f7f5f0;
  --color-surface: #ffffff;
  --color-text-primary: #1e1e1a;
  --color-text-secondary: #4a4a45;
  --color-text-muted: #8a8a82;
  --color-border: #e0ded8;
  --color-status-overdue: #c0392b;
  --color-status-urgent: #d4820a;
  --color-status-upcoming: #1a6b9a;
  --color-status-resolved: #2d7a4f;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-background: #141412;
    --color-surface: #1e1e1a;
    --color-text-primary: #f0ede6;
    --color-text-secondary: #b0ada6;
    --color-border: #2e2e28;
    --color-primary: #1a8a5a;
    --color-accent: #d4aa3a;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui/
git commit -m "feat(ui): add Tailwind design system with HakiOS brand palette"
```

---

## Task 5: `packages/email` — React Email templates

**Files:**
- Create: `packages/email/package.json`
- Create: `packages/email/tsconfig.json`
- Create: `packages/email/src/invite.tsx`
- Create: `packages/email/src/reset.tsx`
- Create: `packages/email/src/reminder.tsx`
- Create: `packages/email/src/escalation.tsx`
- Create: `packages/email/src/index.ts`

**Interfaces:**
- Consumes: `@react-email/components`
- Produces: `renderInviteEmail(props)`, `renderResetEmail(props)`, `renderReminderEmail(props)`, `renderEscalationEmail(props)` — each returns `Promise<string>` (HTML)

- [ ] **Step 1: Write `packages/email/package.json`**

```json
{
  "name": "@hakios/email",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@react-email/components": "^0.0.21",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "typescript": "*"
  }
}
```

- [ ] **Step 2: Write `packages/email/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `src/invite.tsx`**

```tsx
import { render } from '@react-email/components'
import {
  Html, Head, Body, Container, Heading, Text, Button, Hr, Section,
} from '@react-email/components'
import * as React from 'react'

interface InviteEmailProps {
  firstName: string
  firmName: string
  setupUrl: string
  expiresInHours: number
}

function InviteEmail({ firstName, firmName, setupUrl, expiresInHours }: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f7f5f0', fontFamily: 'Inter, sans-serif' }}>
        <Container style={{ maxWidth: '560px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '8px', padding: '40px' }}>
          <Heading style={{ color: '#0a5c3e', fontSize: '24px', marginBottom: '8px' }}>
            Welcome to {firmName}
          </Heading>
          <Text style={{ color: '#1e1e1a', fontSize: '16px' }}>
            Hi {firstName},
          </Text>
          <Text style={{ color: '#4a4a45', fontSize: '16px' }}>
            You have been added to HakiOS. Click the button below to set your password and access the system.
          </Text>
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button
              href={setupUrl}
              style={{ backgroundColor: '#0a5c3e', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', fontSize: '16px', fontWeight: '500' }}
            >
              Set up your account
            </Button>
          </Section>
          <Hr style={{ borderColor: '#e0ded8' }} />
          <Text style={{ color: '#8a8a82', fontSize: '13px' }}>
            This link expires in {expiresInHours} hours and can only be used once. If you did not expect this invitation, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderInviteEmail(props: InviteEmailProps): Promise<string> {
  return render(<InviteEmail {...props} />)
}
```

- [ ] **Step 4: Write `src/reset.tsx`**

```tsx
import { render } from '@react-email/components'
import {
  Html, Head, Body, Container, Heading, Text, Button, Hr, Section,
} from '@react-email/components'
import * as React from 'react'

interface ResetEmailProps {
  firstName: string
  firmName: string
  resetUrl: string
}

function ResetEmail({ firstName, firmName, resetUrl }: ResetEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f7f5f0', fontFamily: 'Inter, sans-serif' }}>
        <Container style={{ maxWidth: '560px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '8px', padding: '40px' }}>
          <Heading style={{ color: '#0a5c3e', fontSize: '24px', marginBottom: '8px' }}>
            Password Reset — {firmName}
          </Heading>
          <Text style={{ color: '#1e1e1a' }}>Hi {firstName},</Text>
          <Text style={{ color: '#4a4a45' }}>
            We received a request to reset your password. Click the button below to choose a new one.
          </Text>
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button
              href={resetUrl}
              style={{ backgroundColor: '#0a5c3e', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', fontSize: '16px' }}
            >
              Reset password
            </Button>
          </Section>
          <Hr style={{ borderColor: '#e0ded8' }} />
          <Text style={{ color: '#8a8a82', fontSize: '13px' }}>
            This link expires in 1 hour and can only be used once. If you did not request a password reset, ignore this email — your password has not changed.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderResetEmail(props: ResetEmailProps): Promise<string> {
  return render(<ResetEmail {...props} />)
}
```

- [ ] **Step 5: Write `src/reminder.tsx`**

```tsx
import { render } from '@react-email/components'
import {
  Html, Head, Body, Container, Heading, Text, Button, Hr, Row, Column, Section,
} from '@react-email/components'
import * as React from 'react'

interface ReminderEmailProps {
  recipientName: string
  firmName: string
  matterName: string
  matterNumber: string
  eventType: string
  eventDate: string       // human-readable e.g. "Monday, 7 July 2026"
  advocates: string[]
  courtName?: string
  courtFileNumber?: string
  eventUrl: string
  daysUntil: number
}

function ReminderEmail({
  recipientName, firmName, matterName, matterNumber, eventType,
  eventDate, advocates, courtName, courtFileNumber, eventUrl, daysUntil,
}: ReminderEmailProps) {
  const urgencyColor = daysUntil <= 1 ? '#c0392b' : daysUntil <= 7 ? '#d4820a' : '#1a6b9a'
  const urgencyLabel = daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'TOMORROW' : `IN ${daysUntil} DAYS`

  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f7f5f0', fontFamily: 'Inter, sans-serif' }}>
        <Container style={{ maxWidth: '560px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '8px', padding: '40px' }}>
          <Section style={{ backgroundColor: urgencyColor, borderRadius: '4px', padding: '8px 16px', marginBottom: '24px' }}>
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: '13px', margin: 0 }}>
              {urgencyLabel} — {eventType.replace(/_/g, ' ').toUpperCase()}
            </Text>
          </Section>
          <Heading style={{ color: '#0a5c3e', fontSize: '22px' }}>{matterName}</Heading>
          <Text style={{ color: '#8a8a82', fontSize: '13px', marginTop: '-12px' }}>
            Matter {matterNumber}
          </Text>
          <Hr style={{ borderColor: '#e0ded8' }} />
          <Row>
            <Column><Text style={{ color: '#4a4a45', fontSize: '14px' }}><strong>Date:</strong> {eventDate}</Text></Column>
          </Row>
          {courtName && (
            <Row>
              <Column><Text style={{ color: '#4a4a45', fontSize: '14px' }}><strong>Court:</strong> {courtName}</Text></Column>
            </Row>
          )}
          {courtFileNumber && (
            <Row>
              <Column><Text style={{ color: '#4a4a45', fontSize: '14px' }}><strong>File no.:</strong> {courtFileNumber}</Text></Column>
            </Row>
          )}
          <Row>
            <Column>
              <Text style={{ color: '#4a4a45', fontSize: '14px' }}>
                <strong>Advocates:</strong> {advocates.join(', ')}
              </Text>
            </Column>
          </Row>
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button
              href={eventUrl}
              style={{ backgroundColor: '#0a5c3e', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', fontSize: '15px' }}
            >
              View event in HakiOS
            </Button>
          </Section>
          <Hr style={{ borderColor: '#e0ded8' }} />
          <Text style={{ color: '#8a8a82', fontSize: '12px' }}>
            Sent by {firmName} via HakiOS Practice Management
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderReminderEmail(props: ReminderEmailProps): Promise<string> {
  return render(<ReminderEmail {...props} />)
}
```

- [ ] **Step 6: Write `src/escalation.tsx`**

```tsx
import { render } from '@react-email/components'
import {
  Html, Head, Body, Container, Heading, Text, Button, Hr, Section,
} from '@react-email/components'
import * as React from 'react'

interface EscalationEmailProps {
  partnerName: string
  firmName: string
  matterName: string
  matterNumber: string
  eventType: string
  eventDate: string
  advocateName: string
  hoursUnacknowledged: number
  eventUrl: string
}

function EscalationEmail({
  partnerName, firmName, matterName, matterNumber, eventType,
  eventDate, advocateName, hoursUnacknowledged, eventUrl,
}: EscalationEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f7f5f0', fontFamily: 'Inter, sans-serif' }}>
        <Container style={{ maxWidth: '560px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '8px', padding: '40px' }}>
          <Section style={{ backgroundColor: '#c0392b', borderRadius: '4px', padding: '8px 16px', marginBottom: '24px' }}>
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: '13px', margin: 0 }}>
              ESCALATION — UNACKNOWLEDGED EVENT
            </Text>
          </Section>
          <Heading style={{ color: '#0a5c3e', fontSize: '22px' }}>Action Required, {partnerName}</Heading>
          <Text style={{ color: '#4a4a45' }}>
            The following event has not been acknowledged by {advocateName} for {hoursUnacknowledged} hours.
          </Text>
          <Hr style={{ borderColor: '#e0ded8' }} />
          <Text style={{ color: '#4a4a45', fontSize: '14px' }}>
            <strong>Matter:</strong> {matterName} ({matterNumber})<br />
            <strong>Event:</strong> {eventType.replace(/_/g, ' ')}<br />
            <strong>Date:</strong> {eventDate}<br />
            <strong>Assigned to:</strong> {advocateName}
          </Text>
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button
              href={eventUrl}
              style={{ backgroundColor: '#c0392b', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', fontSize: '15px' }}
            >
              Review event now
            </Button>
          </Section>
          <Hr style={{ borderColor: '#e0ded8' }} />
          <Text style={{ color: '#8a8a82', fontSize: '12px' }}>Sent by {firmName} via HakiOS</Text>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderEscalationEmail(props: EscalationEmailProps): Promise<string> {
  return render(<EscalationEmail {...props} />)
}
```

- [ ] **Step 7: Write `src/index.ts`**

```typescript
export { renderInviteEmail } from './invite.js'
export { renderResetEmail } from './reset.js'
export { renderReminderEmail } from './reminder.js'
export { renderEscalationEmail } from './escalation.js'
```

- [ ] **Step 8: Build and verify**

```bash
cd packages/email && npm install && npm run build
```

Expected: `dist/` created, no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
cd ../..
git add packages/email/
git commit -m "feat(email): add React Email templates for invite, reset, reminder, escalation"
```

---

## Task 6: Database client + full schema migration

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/db/client.ts`
- Create: `apps/api/src/db/migrate.ts`
- Create: `apps/api/src/db/migrations/001_initial.sql`
- Create: `apps/api/src/db/migrations/002_seed.sql`

**Interfaces:**
- Consumes: `DATABASE_URL` env var
- Produces: `db` — a `pg.Pool` instance imported by all services; `npm run db:migrate` CLI command

- [ ] **Step 1: Write `apps/api/package.json`**

```json
{
  "name": "@hakios/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "test": "vitest run",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "@hakios/types": "*",
    "@hakios/utils": "*",
    "@hakios/email": "*",
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "express": "^4.19.0",
    "express-rate-limit": "^7.3.0",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.12.0",
    "resend": "^3.3.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/pg": "^8.11.6",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.15.0",
    "typescript": "*",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Write `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `apps/api/src/db/client.ts`**

```typescript
import pg from 'pg'

const { Pool } = pg

if (!process.env['DATABASE_URL']) {
  throw new Error('DATABASE_URL environment variable is required')
}

export const db = new Pool({
  connectionString: process.env['DATABASE_URL'],
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
})

db.on('error', (err) => {
  console.error('Unexpected pg pool error', err)
})
```

- [ ] **Step 4: Write `apps/api/src/db/migrate.ts`**

```typescript
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg
const __dirname = dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const connectionString = process.env['DATABASE_URL']
  if (!connectionString) throw new Error('DATABASE_URL is required')

  const client = new Client({ connectionString })
  await client.connect()

  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      run_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const migrationsDir = join(__dirname, 'migrations')
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const { rows } = await client.query(
      'SELECT id FROM _migrations WHERE filename = $1',
      [file],
    )
    if ((rows as unknown[]).length > 0) {
      console.log(`  skip  ${file}`)
      continue
    }

    const sql = await readFile(join(migrationsDir, file), 'utf8')
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`  ran   ${file}`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  }

  await client.end()
  console.log('Migrations complete.')
}

migrate().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 5: Write `apps/api/src/db/migrations/001_initial.sql`**

```sql
-- ── Auth ───────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'partner', 'associate', 'clerk')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE password_resets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Clients ────────────────────────────────────────────────────────────────

CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       TEXT UNIQUE NOT NULL,  -- CLT-YYYY-NNNNN
  client_type     TEXT NOT NULL CHECK (client_type IN ('individual', 'corporate')),
  full_name       TEXT NOT NULL,
  id_number       TEXT,
  contact_person  TEXT,
  phone           TEXT,
  email           TEXT,
  postal_address  TEXT,
  kra_pin         TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dormant', 'closed')),
  has_conflict    BOOLEAN NOT NULL DEFAULT false,
  conflict_notes  TEXT,
  internal_notes  TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  updated_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE client_sequences (
  year      INTEGER PRIMARY KEY,
  next_val  INTEGER NOT NULL DEFAULT 1
);

-- ── Matters ────────────────────────────────────────────────────────────────

CREATE TABLE matter_type_codes (
  code        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE matters (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_number           TEXT UNIQUE NOT NULL,
  client_id               UUID NOT NULL REFERENCES clients(id),
  matter_type             TEXT NOT NULL REFERENCES matter_type_codes(code),
  description             TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','pending','adjourned','on_appeal','settled','closed')),
  lead_advocate_id        UUID REFERENCES users(id),
  supervising_partner_id  UUID REFERENCES users(id),
  opposing_party          TEXT,
  opposing_advocate       TEXT,
  court_name              TEXT,
  court_station           TEXT,
  court_division          TEXT,
  court_file_number       TEXT,
  judge                   TEXT,
  next_action             TEXT,
  next_action_due         DATE,
  date_opened             DATE NOT NULL DEFAULT CURRENT_DATE,
  date_closed             DATE,
  opened_by               UUID NOT NULL REFERENCES users(id),
  updated_by              UUID NOT NULL REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE matter_clerks (
  matter_id  UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (matter_id, user_id)
);

CREATE TABLE related_matters (
  matter_id         UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  related_matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  PRIMARY KEY (matter_id, related_matter_id),
  CHECK (matter_id <> related_matter_id)
);

CREATE TABLE matter_timeline (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id   UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL
                CHECK (event_type IN ('status_change','assignment_change','note','event_linked','closure')),
  description TEXT NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE matter_sequences (
  year      INTEGER PRIMARY KEY,
  next_val  INTEGER NOT NULL DEFAULT 1
);

-- ── Calendar ───────────────────────────────────────────────────────────────

CREATE TABLE calendar_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type              TEXT NOT NULL
                            CHECK (event_type IN (
                              'court_hearing','filing_deadline','submission_deadline',
                              'mention','client_meeting','internal_review'
                            )),
  title                   TEXT NOT NULL,
  matter_id               UUID NOT NULL REFERENCES matters(id),
  date                    DATE NOT NULL,
  time                    TIME,
  supervising_partner_id  UUID REFERENCES users(id),
  notes                   TEXT,
  recurrence              TEXT NOT NULL DEFAULT 'none'
                            CHECK (recurrence IN ('none','weekly','monthly','custom')),
  recurrence_parent_id    UUID REFERENCES calendar_events(id),
  is_resolved             BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at         TIMESTAMPTZ,
  created_by              UUID NOT NULL REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_assignees (
  event_id  UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, user_id)
);

-- ── Notifications ──────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type      TEXT NOT NULL CHECK (type IN ('reminder','escalation','overdue')),
  title     TEXT NOT NULL,
  body      TEXT NOT NULL,
  matter_id UUID REFERENCES matters(id),
  event_id  UUID REFERENCES calendar_events(id),
  is_read   BOOLEAN NOT NULL DEFAULT false,
  read_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

-- ── Reminder config ────────────────────────────────────────────────────────

CREATE TABLE reminder_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,
  days_before INTEGER NOT NULL CHECK (days_before >= 1),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_type, days_before)
);

-- ── Audit ─────────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id),
  action       TEXT NOT NULL,
  record_type  TEXT NOT NULL,
  record_id    TEXT NOT NULL,
  before_value JSONB,
  after_value  JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_record ON audit_log (record_type, record_id);
CREATE INDEX idx_audit_log_user   ON audit_log (user_id);
CREATE INDEX idx_audit_log_time   ON audit_log (created_at DESC);

-- ── Settings ───────────────────────────────────────────────────────────────

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Documents stub (Phase 2 — Cloudflare R2) ──────────────────────────────

CREATE TABLE documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id   UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES clients(id),
  file_name   TEXT NOT NULL,
  file_key    TEXT NOT NULL,       -- Cloudflare R2 object key
  file_size   INTEGER NOT NULL,    -- bytes
  mime_type   TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_matter ON documents (matter_id);
```

- [ ] **Step 6: Write `apps/api/src/db/migrations/002_seed.sql`**

```sql
-- Default matter type codes
INSERT INTO matter_type_codes (code, label) VALUES
  ('LIT',  'Litigation'),
  ('CORP', 'Corporate / Commercial'),
  ('ADV',  'Advisory'),
  ('CONV', 'Conveyancing'),
  ('EMP',  'Employment'),
  ('FAM',  'Family')
ON CONFLICT (code) DO NOTHING;

-- Default system settings
INSERT INTO settings (key, value) VALUES
  ('case_number',           '{"firmPrefix":"LF","includeTypeCode":true,"includeYear":true,"sequenceDigits":5,"separator":"/"}'),
  ('firm_profile',          '{"firmName":"","address":"","phone":"","email":""}'),
  ('email_delivery_mode',   '"realtime"'),
  ('digest_send_time',      '"07:00"'),
  ('escalation_threshold_hours', '24')
ON CONFLICT (key) DO NOTHING;

-- Default reminder schedules (days before event)
INSERT INTO reminder_schedules (event_type, days_before) VALUES
  ('court_hearing', 30), ('court_hearing', 14), ('court_hearing', 7),
  ('court_hearing', 3),  ('court_hearing', 1),
  ('filing_deadline', 30), ('filing_deadline', 14), ('filing_deadline', 7),
  ('filing_deadline', 3),  ('filing_deadline', 1),
  ('submission_deadline', 14), ('submission_deadline', 7), ('submission_deadline', 3),
  ('mention', 7), ('mention', 3), ('mention', 1),
  ('client_meeting', 3), ('client_meeting', 1),
  ('internal_review', 3), ('internal_review', 1)
ON CONFLICT (event_type, days_before) DO NOTHING;
```

- [ ] **Step 7: Provision a local dev database and run migrations**

```bash
# Create local database (requires psql installed)
createdb hakios

# Copy env file and set DATABASE_URL
cp .env.example apps/api/.env
# Edit apps/api/.env: set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hakios

cd apps/api && npm run db:migrate
```

Expected output:
```
  ran   001_initial.sql
  ran   002_seed.sql
Migrations complete.
```

- [ ] **Step 8: Commit**

```bash
cd ../..
git add apps/api/
git commit -m "feat(api): add database client, migration runner, full schema, and seed data"
```

---

## Task 7: Express app base + health endpoint

**Files:**
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/middleware/errorHandler.ts`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/__tests__/health.test.ts`

**Interfaces:**
- Consumes: `db` from `src/db/client.ts`
- Produces: `createApp()` — an Express `Application` instance used by both `index.ts` (server) and tests (no port binding); `GET /health` → `200 { status: 'ok' }`

- [ ] **Step 1: Write the failing test — `src/__tests__/health.test.ts`**

```typescript
import { describe, it, expect, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'

const app = createApp()

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})
```

- [ ] **Step 2: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/__tests__/setup.ts'],
  },
})
```

- [ ] **Step 3: Write `src/__tests__/setup.ts`**

```typescript
// Set required env vars before any module imports resolve
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://localhost/hakios_test'
process.env['JWT_SECRET'] = 'test-jwt-secret-32-characters-long'
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-32-chars-long'
process.env['APP_URL'] = 'http://localhost:5173'
```

- [ ] **Step 4: Run test — confirm it fails**

```bash
cd apps/api && npm run test
```

Expected: FAIL — `app.ts` not found.

- [ ] **Step 5: Write `src/middleware/errorHandler.ts`**

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
  const message = statusCode < 500 ? err.message : 'Internal server error'

  if (statusCode >= 500) {
    console.error(err)
  }

  res.status(statusCode).json({ error: message, code: err.code })
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' })
}

export function createError(message: string, statusCode: number, code?: string): AppError {
  const err: AppError = new Error(message)
  err.statusCode = statusCode
  err.code = code
  return err
}
```

- [ ] **Step 6: Write `src/app.ts`**

```typescript
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { errorHandler, notFound } from './middleware/errorHandler.js'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(cors({
    origin: process.env['APP_URL'] ?? 'http://localhost:5173',
    credentials: true,
  }))
  app.use(express.json())

  // Auth routes are rate-limited more strictly (added in Plan 1b)
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

  app.use(notFound)
  app.use(errorHandler)

  return app
}
```

- [ ] **Step 7: Write `src/index.ts`**

```typescript
import 'dotenv/config'
import { createApp } from './app.js'

const port = Number(process.env['API_PORT'] ?? 3000)
const app = createApp()

app.listen(port, () => {
  console.log(`HakiOS API listening on http://localhost:${port}`)
})
```

- [ ] **Step 8: Run tests — all pass**

```bash
npm run test
```

Expected: 1 test PASS — `GET /health returns 200 with status ok`.

- [ ] **Step 9: Smoke-test the dev server**

```bash
npm run dev &
curl http://localhost:3000/health
```

Expected: `{"status":"ok"}`

Kill the dev server: `kill %1`

- [ ] **Step 10: Commit**

```bash
cd ../..
git add apps/api/src/app.ts apps/api/src/index.ts apps/api/src/middleware/ apps/api/vitest.config.ts apps/api/src/__tests__/
git commit -m "feat(api): add Express app factory, error handler, and health endpoint"
```

---

## Self-review

**Spec coverage check:**

| PRD requirement | Covered? |
|---|---|
| Turborepo monorepo with npm workspaces | Task 1 ✓ |
| packages/types shared interfaces | Task 2 ✓ |
| packages/utils (caseNumber, dates, Zod validation) | Task 3 ✓ |
| packages/ui Tailwind brand palette | Task 4 ✓ |
| packages/email React Email templates | Task 5 ✓ |
| Full DB schema: users, clients, matters, calendar, notifications, audit, settings | Task 6 ✓ |
| Documents table stub (Phase 2 / R2) | Task 6 ✓ |
| Cloudflare R2 env vars in .env.example | Task 1 ✓ |
| Express API base with error handling | Task 7 ✓ |
| EAT timezone utility | Task 3 ✓ |
| Default matter type codes (seed) | Task 6 ✓ |
| Default reminder schedules (seed) | Task 6 ✓ |
| Default system settings (seed) | Task 6 ✓ |
| TypeScript strict mode | Tasks 1–7 ✓ |

**JWT auth, RBAC, React app, PWA** — deferred to Plan 1b by design. ✓

**No placeholders found.**

**Type consistency:** `CaseNumberSettings` defined in `packages/types/src/settings.ts` and consumed in `packages/utils/src/caseNumber.ts` with matching field names. `Role` union defined in `packages/types/src/user.ts` and referenced in `packages/types/src/permissions.ts`.

---

*Plan 1a complete. Plan 1b (Authentication + React App + PWA) continues from here.*
