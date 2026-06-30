# HakiOS — Practice Management System
## Product Requirements Document · v1.0

**Status:** Draft  
**Last updated:** June 2026  
**Scope:** Phase 1 — Operational core  
**Platform:** Web (PWA) · Single firm location  

---

## Table of contents

1. [Product overview](#1-product-overview)
2. [Users and roles](#2-users-and-roles)
3. [Authentication and session management](#3-authentication-and-session-management)
4. [Module specifications](#4-module-specifications)
   - 4.1 [Client management](#41-client-management)
   - 4.2 [Matter tracking](#42-matter-tracking)
   - 4.3 [Calendar](#43-calendar)
   - 4.4 [Alerts and reminders](#44-alerts-and-reminders)
   - 4.5 [Settings](#45-settings)
5. [Case numbering scheme](#5-case-numbering-scheme)
6. [PWA and offline behaviour](#6-pwa-and-offline-behaviour)
7. [Data and migration](#7-data-and-migration)
8. [Tech stack](#8-tech-stack)
9. [Design system and colours](#9-design-system-and-colours)
10. [Monorepo structure](#10-monorepo-structure)
11. [Non-functional requirements](#11-non-functional-requirements)
12. [Phased roadmap](#12-phased-roadmap)
13. [Open decisions and deferred items](#13-open-decisions-and-deferred-items)

---

## 1. Product overview

HakiOS is a web-based practice management system for a mixed-practice law firm (litigation and corporate). Phase 1 establishes the operational core: client records, matter tracking, a litigation-aware calendar, and a multi-channel alert engine with configurable reminders.

The system replaces fragmented tools (spreadsheets, generic calendars) with a single source of truth for the firm's day-to-day legal operations.

**Key constraints for Phase 1:**
- Single firm location (no multi-branch support)
- Internal staff only — no client-facing features or portal
- No automated client communications
- No external calendar sync — the system has its own built-in calendar
- Historical data will be entered manually by staff; no automated migration tool required in v1

---

## 2. Users and roles

Four roles are supported. Access is enforced at both the API middleware and database query level.

| Role | Description |
|---|---|
| **Partner** | Full visibility across all matters and clients. Receives escalation alerts. Can close matters. |
| **Associate** | Creates and edits clients and matters. Sees only matters they are assigned to. |
| **Clerk / Paralegal** | Creates calendar events. Views assigned matters and clients. Cannot create or edit matter records. |
| **Admin** | Full system access. Manages users, roles, and all Settings configuration. |

### Permission matrix

| Permission | Partner | Associate | Clerk | Admin |
|---|---|---|---|---|
| View all clients | Yes | Assigned only | Assigned only | Yes |
| Create / edit clients | Yes | Yes | No | Yes |
| View all matters | Yes | Assigned only | Assigned only | Yes |
| Create / edit matters | Yes | Yes | No | Yes |
| Close a matter | Yes | No | No | Yes |
| View firm-wide calendar | Yes | No | No | Yes |
| Create calendar events | Yes | Yes | Yes | Yes |
| Manage users and roles | No | No | No | Yes |
| Configure system settings | No | No | No | Yes |
| View audit log | Yes | No | No | Yes |
| Export audit log | No | No | No | Yes |

---

## 3. Authentication and session management

Authentication is handled entirely within the Express backend using JWT. No third-party auth provider.

### Login
- Email and password authentication
- Passwords hashed with `bcrypt` (minimum 12 salt rounds)
- On successful login, server issues a signed JWT (access token) and a refresh token
- Access token expiry: **15 minutes**
- Refresh token expiry: **7 days**
- Refresh tokens stored in the database (hashed) and invalidated on logout

### Session behaviour
- The frontend silently refreshes the access token using the refresh token before expiry
- If the refresh token has expired or been invalidated, the user is returned to the login screen
- Concurrent sessions are allowed (user can be logged in on desktop and phone simultaneously)
- Logout invalidates the current refresh token only; other sessions remain active

### Password reset
- User requests a password reset via their email address
- System sends a time-limited reset link via Resend (expires after **1 hour**)
- Reset links are single-use; once clicked they are invalidated regardless of whether the password was changed
- Reset tokens are stored hashed in the database
- After a successful reset, all existing refresh tokens for that user are invalidated (forces re-login on all devices)

### Password policy
- Minimum 8 characters
- Must include at least one uppercase letter, one number, and one special character
- Passwords are never stored in plain text or logs

### First-time user setup
- Admin creates user accounts and assigns roles
- New users receive an invite email via Resend with a one-time setup link (expires after **48 hours**)
- On first login, user is prompted to set their password

### Security notes
- All API routes require a valid access token except `/auth/login`, `/auth/refresh`, and `/auth/reset-password`
- Failed login attempts are rate-limited (maximum 5 attempts per 15 minutes per IP)
- JWT secret is stored as an environment variable, never in source code

---

## 4. Module specifications

### 4.1 Client management

#### Purpose
Create and maintain a record for every client of the firm. Clients are the top-level entity; all matters belong to a client.

#### Client types
- **Individual** — natural person
- **Corporate** — company or organisation, with a designated contact person

#### Fields

| Field | Type | Notes |
|---|---|---|
| Client ID | Auto-generated | Format: `CLT-YYYY-NNNNN` e.g. `CLT-2026-00001` |
| Client type | Enum | Individual / Corporate |
| Full name | Text | Person name or company name |
| ID / Registration number | Text | National ID for individuals; registration number for corporates |
| Contact person | Text | Corporate clients only |
| Phone | Text | Primary phone number |
| Email | Text | Primary email |
| Postal address | Text | |
| KRA PIN | Text | Optional |
| Status | Enum | Active / Dormant / Closed |
| Conflict of interest flag | Boolean | Triggers a warning when creating a matter for this client |
| Conflict notes | Text | Required if conflict flag is set |
| Internal notes | Long text | Staff-only; never exposed externally |
| Created by | User reference | |
| Created at | Timestamp | |
| Last updated by | User reference | |
| Last updated at | Timestamp | |

#### Behaviours
- Client ID is system-generated and never editable
- A client cannot be deleted; status can be set to Closed
- Closed clients are visible in search but excluded from default listings
- One client can be linked to many matters
- Search: by name, client ID, phone, email, or status
- All edits are captured in the audit log

---

### 4.2 Matter tracking

#### Purpose
Track every legal matter from opening to closure. A matter belongs to one client and is the central linking entity for calendar events, documents (Phase 2), and billing (Phase 2).

#### Matter types and codes

| Code | Matter type |
|---|---|
| `LIT` | Litigation |
| `CORP` | Corporate / Commercial |
| `ADV` | Advisory |
| `CONV` | Conveyancing |
| `EMP` | Employment |
| `FAM` | Family |

Matter type codes are configurable from Settings. New codes can be added; existing codes can be retired (not deleted) if no active matters reference them.

#### Fields

| Field | Type | Notes |
|---|---|---|
| Matter number | Auto-generated | See Section 5 for format |
| Client | Client reference | Required |
| Matter type | Enum | Drives the type code in the matter number |
| Description | Text | Brief description of the matter |
| Status | Enum | Active / Pending / Adjourned / On appeal / Settled / Closed |
| Lead advocate | User reference | Associate or Partner |
| Supervising partner | User reference | Must be a Partner role |
| Supporting clerks | User references | Multiple allowed |
| Opposing party name | Text | Optional |
| Opposing advocate | Text | Name only; not a system user |
| Court name | Text | Litigation matters |
| Court station | Text | e.g. Milimani, Nairobi |
| Court division | Text | e.g. Civil, Criminal, Commercial |
| Court file number | Text | Court-assigned; separate from internal matter number |
| Judge | Text | |
| Next action | Text | Free text description of the next required step |
| Next action due date | Date | Drives calendar and reminder entries |
| Related matters | Matter references | Multiple; e.g. appeal linked to original case |
| Date opened | Date | |
| Date closed | Date | Set automatically when status moves to Closed |
| Opened by | User reference | |
| Last updated by | User reference | |
| Last updated at | Timestamp | |

#### Matter timeline
Every significant action on a matter is logged to a timeline visible on the matter record:
- Status changes
- Assignment changes
- Calendar events linked or created
- Notes added
- Closure checklist completed

#### Closure checklist
Before a matter can be set to Closed, the system requires confirmation of the following:
- [ ] All court dates resolved or adjourned
- [ ] All outstanding deadlines cleared
- [ ] Client notified of outcome
- [ ] Fee note issued (Phase 2 — noted for now, not enforced in v1)

The checklist must be completed by a Partner or Admin.

#### Behaviours
- Matter number is system-generated using the format configured in Settings
- A closed matter is read-only; reopening requires Admin action
- Matters assigned to a deactivated user are flagged for reassignment
- Search: by matter number, client name, court file number, status, lead advocate, or matter type

---

### 4.3 Calendar

#### Purpose
A built-in, firm-owned calendar for managing all court dates, deadlines, meetings, and legal events. No external calendar sync (no Google Calendar or Outlook integration in v1).

#### Event types

| Event type | Key fields |
|---|---|
| Court hearing | Court name, station, division, judge, hearing type, case number |
| Filing deadline | Submission type, jurisdiction, days-to-deadline counter |
| Submission deadline | Submission type, jurisdiction |
| Mention | Court name, case number |
| Client meeting | Location or virtual link |
| Internal review | Description |

#### Event fields (common to all types)

| Field | Type | Notes |
|---|---|---|
| Event ID | Auto-generated | |
| Event type | Enum | See table above |
| Title | Text | Auto-suggested from event type and matter name |
| Linked matter | Matter reference | Required |
| Linked client | Client reference | Inherited from matter |
| Date | Date | |
| Time | Time | Optional for deadlines |
| Assigned advocates | User references | Multiple allowed |
| Supervising partner | User reference | Inherited from matter; editable |
| Notes | Text | |
| Recurrence | Enum | None / Weekly / Monthly / Custom |
| Created by | User reference | |
| Created at | Timestamp | |

#### Views
- **Month view** — firm-wide overview for partners and admins; personal view for associates and clerks
- **Week view** — detailed scheduling view
- **Day view** — single day with time slots

#### Colour coding by urgency

| State | Colour |
|---|---|
| Overdue | Red |
| Today | Amber |
| Within 7 days | Blue |
| Upcoming | Default (neutral) |

#### Filters
- By advocate
- By matter
- By client
- By court
- By event type
- By date range

#### Behaviours
- Every event must be linked to a matter
- Deleting an event requires confirmation and logs to the audit trail
- Recurring events can be edited individually or as a series
- Partners and Admins see all events across the firm
- Associates and Clerks see only events on their assigned matters

---

### 4.4 Alerts and reminders

#### Purpose
Ensure no court date, filing deadline, or critical event is missed. Reminders are delivered via email (Resend) and in-app notifications. PWA push notifications are included in v1 for mobile and desktop Chrome.

#### Reminder delivery channels
- **Email** via Resend API
- **In-app notification centre** (read/unread state, dismiss, deep link to matter/event)
- **PWA push notification** (Android and desktop Chrome; iOS gets in-app only)

#### Reminder scheduling
- Reminder intervals are configured per event type in Settings (see Section 4.5)
- When an event is created, the system schedules reminder jobs automatically based on the active Settings configuration
- If Settings are changed after an event is created, existing scheduled reminders are not retroactively updated; new events use the new configuration
- Advocates can add personal reminders on any event, in addition to firm defaults

#### Email options
- **Real-time** — one email per reminder trigger
- **Daily digest** — all reminders for the day bundled into one email, sent at a configured time (default 07:00 EAT)
- Firm-wide default set in Settings; individual users can override in their profile

#### Escalation
- If a court hearing or filing deadline event has not been acknowledged in-app within the configured threshold (default 24 hours, configurable in Settings), the supervising partner receives an escalation alert
- Escalation is sent via email and in-app notification
- Acknowledgement is a single tap/click on the notification or event

#### Overdue events
- Events that have passed without being resolved or rescheduled display a persistent red banner in the dashboard
- Banner remains until the event is marked as resolved, rescheduled, or manually dismissed by a Partner or Admin

#### Background job architecture
- Reminder jobs are managed by `pg-boss` (PostgreSQL-backed job queue)
- A scheduler runs daily to create reminder jobs for upcoming events
- Resend API is called by the job worker at dispatch time
- Failed email attempts are retried up to 3 times before being marked as failed and logged

#### Email template content (minimum)
Each reminder email must include:
- Matter name and matter number
- Event type and date
- Assigned advocate(s)
- Court name and file number (where applicable)
- Direct link to the event in the system

---

### 4.5 Settings

Settings is an Admin-only module. It houses all firm-wide configuration so that no operational values are hardcoded in the application.

#### Firm profile
- Firm name
- Physical address
- Phone number
- Email address
- Used in system-generated emails and (in Phase 2) document templates

#### Users and roles
- Invite new users (triggers invite email via Resend)
- Deactivate users (does not delete; reassigns open matters flag)
- Change user roles
- View active sessions per user

#### Case number format
Configurable fields:

| Setting | Options | Default |
|---|---|---|
| Firm prefix | Free text, max 6 characters | `LF` |
| Include matter type code | Toggle on/off | On |
| Include year | Toggle on/off | On |
| Sequence digits | 4 / 5 / 6 digits | 5 digits |
| Separator character | `/` `-` `.` | `/` |

- A live preview is shown as settings are adjusted
- Confirmation required before saving changes
- Format changes apply to new matters only; existing matter numbers are never changed
- Sequential number resets to 1 at the start of each calendar year

#### Reminder schedules
- Configurable per event type
- Each event type can have multiple reminder intervals (e.g. 30, 14, 7, 3 days before)
- Intervals are entered as whole numbers of days
- Minimum: 1 interval per event type
- No maximum limit on number of intervals

#### Escalation threshold
- Number of hours before an unacknowledged court hearing or deadline triggers a partner alert
- Default: 24 hours
- Minimum: 1 hour

#### Email delivery default
- Real-time or daily digest
- Firm-wide default; users can override in their own profile
- Daily digest send time configurable (default 07:00 EAT)

#### Matter types and codes
- Add new matter type codes
- Rename existing codes
- Retire codes (cannot be deleted if referenced by existing matters)

#### Audit log
- Read-only log of all system changes
- Fields: timestamp, user, action, record type, record ID, before/after values
- Partners can view; Admins can export as CSV

---

## 5. Case numbering scheme

Internal matter numbers are auto-generated by the system. They are separate from court-assigned file numbers, which are stored as a distinct field on the matter record.

### Default format

```
LF / LIT / 2026 / 00142
│     │     │      │
│     │     │      └── Sequential number (zero-padded, resets yearly)
│     │     └───────── Year matter was opened
│     └─────────────── Matter type code
└───────────────────── Firm prefix
```

### Rules
- The format is configured in Settings and applied to all new matters
- The sequential number never reuses a value, even for closed matters
- Existing matter numbers are never changed when the format is updated in Settings
- Historical matters entered manually will receive new internal numbers from the current sequence
- The court file number (court-assigned) is stored separately and is always editable

---

## 6. PWA and offline behaviour

HakiOS is built as a Progressive Web App (PWA) from day one using `vite-plugin-pwa`.

### Installation
- Installable on Android (full PWA support including push notifications)
- Installable on iOS (home screen install; push notifications via in-app only, not OS-level)
- Installable on desktop Chrome and Edge

### Offline behaviour

**Online:** Full read and write access to all permitted features.

**Offline:** Read-only access to cached data. The service worker caches:
- The matter list (most recent fetch)
- The calendar (current and next month)
- Client records for assigned matters

**Write attempts offline:** The system detects no connectivity and displays a clear offline indicator. Write actions (creating events, editing matters) are disabled with an explanatory message. This avoids sync conflicts on legal records.

**Reconnection:** Cache refreshes automatically on reconnect. The offline indicator clears.

> Queued writes (offline-to-online sync) are deferred to Phase 2.

### Push notifications
- Web Push API used for push notifications on Android and desktop Chrome
- VAPID keys managed server-side
- Users prompted to allow notifications on first login
- Notification tap deep-links to the relevant event or matter in the app

---

## 7. Data and migration

### Historical data
There is no automated migration tool in v1. Historical client and matter records will be created manually by staff directly in the system. This is a deliberate scope decision to keep v1 lean.

### Import tools (Phase 2)
A structured CSV/Excel import tool will be built in Phase 2 for bulk data entry. The tool will include:
- A field mapping UI
- Validation before import
- A legacy reference field to preserve original reference numbers
- A dry-run preview before committing

### Data retention
- All records (clients, matters, events) are retained indefinitely by default
- Closed matters are read-only but never deleted from the system
- A formal data retention policy should be defined by the firm in line with Kenyan legal practice obligations before Phase 2

### Backups
- Render managed PostgreSQL includes daily automated backups
- Backups retained for a minimum of 7 days (verify based on Render plan tier)
- Admins should periodically verify backup integrity

---

## 8. Tech stack

### Recommended stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React + Vite | Fast builds, large ecosystem, clean PWA setup |
| **Styling** | Tailwind CSS | Utility-first, consistent, no runtime overhead |
| **PWA** | vite-plugin-pwa | Service worker + Web Push with minimal config |
| **Backend** | Node.js + Express | Lightweight REST API, familiar, easy to deploy on Render |
| **Database** | Render PostgreSQL (managed) | Relational, handles matter-client-event model cleanly. Built-in daily backups. No Supabase required. |
| **Auth** | Custom JWT in Express | `jsonwebtoken` for token signing, `bcrypt` for password hashing. Full control, no third-party dependency. |
| **Email** | Resend API | Simple API, reliable delivery, free tier covers internal staff volume. React Email for templates. |
| **Background jobs** | pg-boss | PostgreSQL-backed job queue for reminder scheduling. Runs within the same Render service. |
| **Deployment** | Render | Web service + background worker + cron jobs in one platform. Maps to existing workflow. |

### Environment variables (minimum required)

```
DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
RESEND_API_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
APP_URL=
```

### Deployment architecture

```
Render Web Service     →   Express API
Render Background Worker →  pg-boss job runner (reminders)
Render Cron Job        →   Daily reminder scheduler
Render PostgreSQL      →   Primary database
```

---

## 9. Design system and colours

HakiOS uses a purposeful colour palette rooted in East African identity and legal authority. The palette is defined as CSS custom properties in the shared `packages/ui` package and consumed by Tailwind CSS across the frontend.

### Brand palette

| Role | Name | Hex | Usage |
|---|---|---|---|
| **Primary** | Deep Green | `#0a5c3e` | Primary buttons, active nav, key UI elements |
| **Primary light** | Mid Green | `#2d7a4f` | Hover states, success indicators, resolved events |
| **Accent** | Warm Gold | `#c49a28` | CTAs, highlights, badges, active selections |
| **Accent light** | Soft Gold | `#e8c55a` | Hover on accent elements |
| **Background** | Warm Off-White | `#f7f5f0` | Page background |
| **Surface** | White | `#ffffff` | Cards, modals, panels |
| **Text primary** | Warm Charcoal | `#1e1e1a` | Body text, headings |
| **Text secondary** | Muted Charcoal | `#4a4a45` | Supporting text, labels |
| **Text muted** | Light Grey | `#8a8a82` | Placeholders, hints, disabled states |
| **Border** | Warm Grey | `#e0ded8` | Dividers, input borders |

### Status / urgency colours

These map directly to the calendar urgency states and system alerts.

| State | Name | Hex | Usage |
|---|---|---|---|
| **Overdue** | Alert Red | `#c0392b` | Overdue events, error states |
| **Today / urgent** | Amber | `#d4820a` | Today's events, warnings |
| **Upcoming (7 days)** | Steel Blue | `#1a6b9a` | Near-term events, informational |
| **Resolved / success** | Mid Green | `#2d7a4f` | Resolved events, success toasts |
| **Neutral** | Warm Grey | `#8a8a82` | Default calendar events, inactive states |

### Dark mode
A dark mode variant is included from v1. The palette inverts to warm dark surfaces rather than pure black, preserving the brand warmth.

| Role | Dark mode hex |
|---|---|
| Background | `#141412` |
| Surface | `#1e1e1a` |
| Text primary | `#f0ede6` |
| Text secondary | `#b0ada6` |
| Border | `#2e2e28` |
| Primary | `#1a8a5a` (lightened for dark bg contrast) |
| Accent | `#d4aa3a` (lightened for dark bg contrast) |

### Typography
- **Font family:** Inter (Google Fonts). Clean, highly legible, widely used in legal and enterprise SaaS.
- **Headings:** Inter 500 (medium weight)
- **Body:** Inter 400 (regular)
- **Monospace (case numbers, codes):** JetBrains Mono

### Tailwind configuration
Brand colours are registered as Tailwind custom colours in `tailwind.config.ts` at the root of the monorepo and extended into each app via the shared config package.

```ts
// packages/ui/tailwind.config.ts (shared base)
colors: {
  primary: {
    DEFAULT: '#0a5c3e',
    light:   '#2d7a4f',
  },
  accent: {
    DEFAULT: '#c49a28',
    light:   '#e8c55a',
  },
  surface: '#ffffff',
  background: '#f7f5f0',
  status: {
    overdue:  '#c0392b',
    urgent:   '#d4820a',
    upcoming: '#1a6b9a',
    resolved: '#2d7a4f',
  }
}
```

---

## 10. Monorepo structure

HakiOS is structured as a Turborepo monorepo. All apps and shared packages live in a single GitHub repository, enabling shared types, shared UI config, and coordinated deployments from one place.

### Why a monorepo
- Shared TypeScript types between frontend and API — a field change in the API is immediately flagged in the frontend at compile time
- Shared Tailwind config and design tokens across apps
- Shared email templates (`packages/email`) used by the API but built with React Email
- Single GitHub repository maps to the existing Render + GitHub deployment workflow
- As HakiOS grows into billing, HR, and reporting modules, each can be added as a new app or package without restructuring

### Repository structure

```
hakios/
├── apps/
│   ├── web/                  # React + Vite frontend (PWA)
│   │   ├── src/
│   │   │   ├── pages/        # Route-level components
│   │   │   ├── components/   # Shared UI components
│   │   │   ├── hooks/        # Custom React hooks
│   │   │   ├── lib/          # API client, auth helpers
│   │   │   └── store/        # Client state (Zustand)
│   │   ├── public/
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── api/                  # Node.js + Express backend
│       ├── src/
│       │   ├── routes/       # Express route handlers
│       │   ├── middleware/    # Auth, RBAC, rate limiting
│       │   ├── services/     # Business logic
│       │   ├── jobs/         # pg-boss job definitions
│       │   ├── db/           # PostgreSQL client, migrations
│       │   └── lib/          # Resend, VAPID, utilities
│       └── package.json
│
├── packages/
│   ├── types/                # Shared TypeScript interfaces
│   │   ├── src/
│   │   │   ├── client.ts     # Client, ClientType, ClientStatus
│   │   │   ├── matter.ts     # Matter, MatterType, MatterStatus
│   │   │   ├── calendar.ts   # CalendarEvent, EventType
│   │   │   ├── user.ts       # User, Role
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── utils/                # Shared helpers
│   │   ├── src/
│   │   │   ├── caseNumber.ts # Case number generation logic
│   │   │   ├── dates.ts      # Date formatting (EAT timezone)
│   │   │   └── validation.ts # Shared Zod schemas
│   │   └── package.json
│   │
│   ├── email/                # React Email templates
│   │   ├── src/
│   │   │   ├── reminder.tsx  # Event reminder template
│   │   │   ├── escalation.tsx
│   │   │   ├── invite.tsx    # New user invite
│   │   │   └── reset.tsx     # Password reset
│   │   └── package.json
│   │
│   └── ui/                   # Shared Tailwind config + base components
│       ├── tailwind.config.ts
│       ├── src/
│       │   └── components/   # Headless base components (optional Phase 2+)
│       └── package.json
│
├── docs/
│   └── hakios-prd-v1.md
│
├── .env.example              # All required environment variables documented
├── .gitignore
├── package.json              # Root workspace (npm workspaces)
├── turbo.json                # Turborepo pipeline config
└── README.md
```

### Turborepo pipeline (`turbo.json`)

```json
{
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
    "lint": {}
  }
}
```

### Render deployment mapping

| Render service | Source | Notes |
|---|---|---|
| Web service (API) | `apps/api` | Express server, handles all API routes |
| Static site (Web) | `apps/web` | Vite build output, served as static files |
| Background worker | `apps/api` | Same build, different start command for pg-boss worker |
| Cron job | `apps/api` | Daily reminder scheduler |
| PostgreSQL | Render managed | Connected via `DATABASE_URL` environment variable |

### Key conventions
- All inter-package imports use workspace protocol: `"@hakios/types": "*"`
- TypeScript strict mode enabled across all packages
- ESLint + Prettier enforced at root level via Turborepo lint pipeline
- Environment variables are never committed; `.env.example` documents all required keys
- Database migrations live in `apps/api/src/db/migrations` and run on deploy via a Render pre-deploy command

---

## 11. Non-functional requirements

### Security
- Role-based access enforced at API middleware level and database query level
- All data encrypted at rest (AES-256 via Render managed PostgreSQL)
- All data encrypted in transit (TLS 1.2+)
- JWT secrets stored as environment variables, never in source code
- Rate limiting on auth endpoints (5 failed login attempts per 15 minutes per IP)
- Full audit log on all record mutations

### Performance
- Matter list and calendar load under 2 seconds on a standard connection
- Reminder jobs dispatch within 5 minutes of their scheduled trigger time
- PWA service worker caches key views for offline read access

### Availability
- Target: 99.5% uptime on Render paid tier
- Database: daily automated backups, minimum 7-day retention

### Platform
- Web-first, desktop primary
- PWA for mobile: Android and iOS installable, push on Android and desktop Chrome
- No native mobile app in v1

### Browser support
- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Safari 16+ (iOS and macOS)
- Edge (latest 2 versions)

### Accessibility
- WCAG 2.1 AA as a target standard
- All forms keyboard-navigable
- Sufficient colour contrast for urgency indicators

---

## 12. Phased roadmap

### Phase 1 — Operational core (current scope)
- Client management
- Matter tracking
- Built-in calendar
- Alerts and reminders (email via Resend + in-app + PWA push)
- Settings module
- Custom JWT authentication with password reset and session management

### Phase 2 — Billing, documents, and import
- Time recording
- Fee notes and invoicing
- Document storage and management
- Document template generation
- CSV/Excel bulk import tool for historical data
- Queued writes for offline-to-online sync

### Phase 3 — Reporting and scale
- Matter and revenue reports and dashboards
- Client portal
- Multi-branch support
- Court system integrations (where available)
- SMS notifications

---

## 13. Open decisions and deferred items

| Item | Status | Notes |
|---|---|---|
| Firm prefix for case numbers | **Pending firm decision** | Placeholder `LF` used in spec. Confirm actual initials before go-live. |
| Data retention policy | **Deferred** | Firm to define in line with Kenyan legal practice obligations before Phase 2. |
| Fee note enforcement on closure | **Deferred to Phase 2** | Closure checklist notes fee note requirement but does not enforce it in v1 (billing module not yet built). |
| Queued writes (offline sync) | **Deferred to Phase 2** | Offline behaviour in v1 is read-only. Sync queue adds complexity that should wait until core is stable. |
| Import tool | **Deferred to Phase 2** | Historical data entered manually in v1. Bulk import tool scoped for Phase 2. |
| SMS notifications | **Deferred to Phase 3** | Email and in-app cover v1 needs. SMS adds cost and a new integration. |
| Multi-branch support | **Deferred to Phase 3** | Single location in v1. |
| Client portal | **Deferred to Phase 3** | No client-facing features in v1. |

---

*HakiOS PRD v1.0 — prepared June 2026*
