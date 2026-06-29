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

-- Performance indexes for primary query patterns
CREATE INDEX idx_matters_client      ON matters (client_id);
CREATE INDEX idx_matters_status      ON matters (status);
CREATE INDEX idx_cal_events_date     ON calendar_events (date);
CREATE INDEX idx_cal_events_matter   ON calendar_events (matter_id);
CREATE INDEX idx_notifications_user  ON notifications (user_id, is_read);
