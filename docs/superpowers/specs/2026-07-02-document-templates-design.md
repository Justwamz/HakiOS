# Document Templates (Phase 2) — Design Spec

**Date:** 2026-07-02
**Status:** Approved, pending implementation plan

## 1. Overview

Add a document template library to HakiOS. Partners/admins upload reusable Word templates (NDA, lease, affidavit, board resolution, etc.) with variable placeholders. Staff can then "quick-create" a filled `.docx` for a specific client or matter without retyping boilerplate. Templates carry a version history with change notes, so updating a clause (e.g. a change in rent law) automatically applies to every future document generated from that template, while documents already generated stay frozen to the wording that existed at the time.

This is a Phase 2 feature. It also stands up the project's first real Cloudflare R2 integration — env vars for this were already reserved in `.env.example` but unused until now.

Separately, this spec also covers a plain-English error message cleanup across the existing app (Section 8), bundled in at the user's request since the templates feature raised the same issue.

## 2. Data Model

New tables (the existing `documents` table stays untouched — it's a stub reserved for a *different*, future feature: uploading arbitrary files to a matter, and requires a non-null `matter_id` which doesn't fit here since template-generated documents can be client-only):

```sql
document_templates (
  id           UUID PK
  name         TEXT NOT NULL          -- e.g. "Commercial Lease Agreement"
  category     TEXT NOT NULL          -- e.g. "Lease", "NDA", "Affidavit", "Board Resolution"
  created_by   UUID REFERENCES users(id)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
)

document_template_versions (
  id              UUID PK
  template_id     UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE
  version_number  INTEGER NOT NULL          -- 1, 2, 3... per template
  file_key        TEXT NOT NULL             -- R2 object key: templates/{template_id}/v{n}.docx
  file_name       TEXT NOT NULL             -- original upload filename
  change_note     TEXT NOT NULL             -- "Initial version" for v1; required thereafter
  created_by      UUID REFERENCES users(id)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  UNIQUE (template_id, version_number)
)

generated_documents (
  id                    UUID PK
  template_id           UUID REFERENCES document_templates(id) ON DELETE SET NULL
  template_version_id   UUID REFERENCES document_template_versions(id) ON DELETE SET NULL
  template_name         TEXT NOT NULL      -- snapshot, survives template rename/delete
  client_id             UUID NOT NULL REFERENCES clients(id)
  matter_id             UUID NULL REFERENCES matters(id)   -- nullable: client-only generation is allowed
  file_key              TEXT NOT NULL      -- R2 object key: generated/{id}.docx
  file_name             TEXT NOT NULL
  generated_by          UUID REFERENCES users(id)
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

The `POST /api/templates/:id/generate` request body takes exactly one of `clientId` or `matterId` (never both, never neither — enforced by a Zod `.refine`). If `matterId` is given, `client_id` on the resulting `generated_documents` row is derived from that matter's own `client_id`, not passed separately.

`FirmProfile` (`packages/types/src/settings.ts`) gains one field:

```typescript
export interface FirmProfile {
  firmName: string
  address: string
  phone: string
  email: string
  logoKey: string | null   // R2 object key: branding/logo.{ext}
}
```

"Quick-create" always renders from the latest version of a template (`MAX(version_number)`) — there's no separate "current version" pointer to keep in sync. Every `generated_documents` row records the exact `template_version_id` used, so a client/matter's document history always shows precisely which wording was used, even after the master template has since changed.

## 3. File Storage (Cloudflare R2)

One bucket (`hakios-documents`, already named in `.env.example`), three key prefixes:
- `templates/{template_id}/v{n}.docx`
- `generated/{id}.docx`
- `branding/logo.{ext}`

`apps/api/src/lib/r2.ts` — a thin wrapper around the S3-compatible SDK: `putObject`, `getObject`, `getSignedDownloadUrl` (short-lived, ~5 min expiry). All three file types (templates, generated docs, logo) go through this one wrapper. This becomes the foundation the existing `documents` table stub can build on when that separate upload feature is eventually implemented.

All downloads (templates, generated docs, logo) are served via signed URLs rather than proxied through the API.

## 4. Variable Placeholders

Templates use `{{tag}}` syntax (double curly braces, so it reads clearly as "fill this in" to a non-technical template author). Fixed variable set for v1:

| Source | Tags |
|---|---|
| Client | `{{client_name}}`, `{{client_email}}`, `{{client_phone}}`, `{{client_id}}`, `{{client_type}}`, `{{client_kra_pin}}`, `{{client_address}}` |
| Matter (blank if quick-create was client-only) | `{{matter_number}}`, `{{matter_description}}`, `{{matter_type}}`, `{{matter_date_opened}}` |
| Firm | `{{firm_name}}`, `{{firm_address}}`, `{{firm_phone}}`, `{{firm_email}}` |
| Meta | `{{today_date}}`, `{{generated_by_name}}` (the staff member running quick-create) |

If a template contains a tag outside this list (typo, or an inapplicable variable), generation doesn't fail — it fills an empty string and the API response includes a `warnings` array so the UI can flag it after download (see Section 8 for the exact wording).

## 5. Firm Logo on Generated Documents

Injecting a dynamic logo into a `.docx` needs an add-on beyond docxtemplater's core text merging. Approach: **`docxtemplater-image-module-free`** (community, MIT-licensed) — a Word template marks an image placeholder with a tag (`{%firm_logo}`); at generation time we swap in the firm's uploaded logo bytes. Known limitation: the inserted image renders at a fixed size configured in code, not auto-sized from the placeholder — acceptable trade-off, confirmed with the user.

- Settings page gets a "Branding" subsection: upload/replace/remove logo (PNG/JPEG, max 2MB), with a thumbnail preview. `POST /api/settings/logo` (multipart, `settings:manage`) stores it in R2 and updates `logoKey`.
- Templates that want the logo include the `{%firm_logo}` image tag once, at upload time — not something a user deals with per-generation.
- `generateDocument` fetches the current logo from R2 (if `logoKey` is set) and passes it to the image module during merge, alongside the text variables from Section 4.

## 6. Permissions

New permissions, following the existing `domain:action` pattern in `packages/types/src/permissions.ts`:
- `templates:manage` — admin, partner. Upload templates, add new versions (with change note), delete templates.
- `templates:use` — admin, partner, associate, clerk (everyone). Browse the template library and quick-create a document from any template.

Generating a document additionally requires the same read access the user already has to the underlying client/matter (e.g. an associate limited to `clients:read_assigned` can't quick-create against a client outside their assignment) — this reuses existing permission checks rather than inventing new ones.

## 7. Backend & Frontend

**Backend** (new deps: `docxtemplater`, `pizzip`, `docxtemplater-image-module-free`, `multer`, an S3-compatible client for R2):
- `apps/api/src/lib/r2.ts` — storage wrapper (Section 3)
- `apps/api/src/services/templates.ts` — `listTemplates`, `getTemplate` (+ versions), `createTemplate`, `addTemplateVersion`, `generateDocument`, `listGeneratedDocuments(clientId | matterId)`
- `apps/api/src/routes/templates.ts`:
  - `GET /api/templates` (`?category=`) — `templates:use`
  - `GET /api/templates/:id` — version history — `templates:use`
  - `POST /api/templates` (multipart: name, category, file) — `templates:manage`
  - `POST /api/templates/:id/versions` (multipart: file, change_note) — `templates:manage`
  - `DELETE /api/templates/:id` — `templates:manage`
  - `POST /api/templates/:id/generate` (body: exactly one of `clientId` / `matterId`) — `templates:use`
  - `GET /api/documents/generated?clientId=&matterId=` — history list — `templates:use`
  - `GET /api/documents/generated/:id/download` — `templates:use`
- `apps/api/src/routes/settings.ts` gains `POST /api/settings/logo` (multipart, `settings:manage`)

**Frontend** (`apps/web/src/pages/templates/`):
- Entry point is the client/matter, not the template library. `ClientDetailPage` and `MatterDetailPage` each get a new "Documents" section: list of `generated_documents` for that client/matter (template name, generated-by, date, download link) plus a "Generate Document" button, which opens a small page to pick a template (dropdown grouped by category) and generate.
- `/templates` — library list (name, category, latest version #, last updated), filterable by category. Admin/partner see "Upload Template"; everyone else sees the same list read-only (no generate action here — generating needs a client/matter context first).
- `/templates/new` — `CreateTemplatePage` (`templates:manage`)
- `/templates/:id` — `TemplateDetailPage`: version history table (version #, change note, uploaded by, date, download-that-version link) and, for managers, an "Upload New Version" form (file + required change note).
- Nav: add "Templates" to the sidebar (`Layout.tsx`), visible to everyone, same pattern as Calendar.

## 8. Error Messages — Plain English (app-wide)

**Standard going forward:** every user-facing error message (API validation errors, permission errors, frontend form errors) must be written the way you'd explain the problem out loud to a non-technical staff member — what went wrong and what to do next — never internal error codes, field names, or regex/technical language. This makes it obvious to support staff exactly what a user is complaining about when they report an issue.

**New messages introduced by this feature:**

| Situation | Message |
|---|---|
| Missing change note on a template version | "You need to add a note describing what you changed before saving the template." |
| Wrong template file type | "Please upload a Word document (.docx file)." |
| Template file too large | "This file is too large. Please upload a file smaller than 15MB." |
| Logo file too large | "This file is too large. Please upload a file smaller than 2MB." |
| Neither client nor matter chosen on generate | "Please choose a client or a matter before creating the document." |
| Unrecognized placeholder in a template | "This template has a spot we couldn't fill in automatically. The document was still created, but you'll need to fill that part in yourself." |
| Permission denied | "You don't have permission to do this. Please contact your administrator." |

**Existing messages to clean up as part of this work** (found by codebase audit; each gets a specific plain-English replacement instead of the current generic/technical text):

*Backend (`createError` calls and Zod validation):*
- `apps/api/src/routes/auth.ts:13`, `calendar.ts:72,109`, `settings.ts:44,70,111,196`, `users.ts:66` — generic "Validation error" fallback wherever a Zod parse fails. Replace with a message built from the specific field that failed (e.g. "Please enter a valid email address" / "Please fill in the [field name]"), not the raw Zod message.
- `apps/api/src/routes/clients.ts:46,59,94,96`, `matters.ts:83,96,128,147` — "Invalid query parameters" / "Invalid request body" / "Missing id" → "We couldn't find what you were looking for. Please refresh the page and try again." (for missing-id cases) or specific field guidance (for bad input).
- `apps/api/src/routes/settings.ts:103` — "Code must be uppercase letters, digits, or underscores" → "The matter type code can only use capital letters, numbers, and underscores (e.g. LIT_2024)."
- `apps/api/src/routes/settings.ts:138` — "isActive must be a boolean" → "Something went wrong updating the status. Please try again." (this one's a developer-error case, not user-facing input, so keep it generic and log details server-side)
- `apps/api/src/middleware/requireRole.ts:9,13` — "Authentication required" / "Insufficient permissions" → "Please sign in to continue." / "You don't have permission to do this. Please contact your administrator." (standardizes the two permission-denied messages used across ~8 call sites into one consistent pair)
- `apps/api/src/services/auth.ts:41,45` — "Invalid email or password" → keep as-is (this one is already plain English and intentionally non-specific for security)
- `apps/api/src/routes/users.ts:85` — "Cannot deactivate your own account" → "You can't deactivate your own account. Ask another admin to do this if needed."
- `apps/api/src/services/matters.ts:112` — "Case number settings not configured" → "Case numbering hasn't been set up yet. Ask an admin to set it up in Settings before creating a matter."
- `apps/api/src/routes/calendar.ts:104` — "Cannot edit a resolved event" → "This event has already been marked resolved and can't be edited."
- Zod field constraints across `calendar.ts`, `matters.ts` that have no custom `.regex()` message (falls back to Zod's default "Invalid") — add explicit plain-English messages, e.g. "Please enter the date in the format YYYY-MM-DD."
- `apps/api/src/middleware/errorHandler.ts:15` — generic "Internal server error" for unhandled 5xx → replace with "Something went wrong on our end. Please try again, and contact support if it keeps happening." (keep logging the real error server-side for debugging; this is only about what the user sees)

*Frontend (`apps/web/src/lib/api.ts:86` and per-page fallbacks):*
- `apps/web/src/lib/api.ts:86` — "Unknown error" fallback when the API response body can't be parsed → "Something went wrong. Please check your connection and try again."
- Per-page fallback strings (`LoginPage.tsx:46`, `SetPasswordPage.tsx:64`, `RequestResetPage.tsx:30`, `CreateClientPage.tsx:50`, `ClientEditPage.tsx:83`, `CreateCalendarEventPage.tsx:77,102`, `CalendarEventDetailPage.tsx:37,61`, `CalendarEventEditPage.tsx:118`, `CreateMatterPage.tsx:79`, `MatterEditPage.tsx:120`, `SettingsPage.tsx:119,133,147`, `InviteUserPage.tsx:46`) are already reasonably plain — the real gap is that these pages display whatever message the *backend* sent verbatim via `(err as Error).message`, so fixing the backend messages above automatically fixes what shows up here too. No separate frontend rework needed beyond that, other than double-checking none of these ever leak a raw stack trace (they don't currently, based on the audit).

## 9. Testing

`apps/api/src/__tests__/templates.test.ts` (Vitest + Supertest, matching existing convention — integration tests need a live DB; `ECONNREFUSED` locally is expected and not a bug) covering: upload v1, add version with/without change note, generate (client-only and matter-based), unresolved-placeholder warning, permission checks (403 for `associate`/`clerk` on manage routes, allowed for `templates:use`).

The error-message cleanup (Section 8) is verified by updating/adding assertions in each affected route's existing test file to check for the new plain-English text instead of the old message, rather than a separate test suite.
