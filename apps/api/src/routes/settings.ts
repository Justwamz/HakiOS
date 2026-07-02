import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { db } from '../db/client.js'
import { createError } from '../middleware/errorHandler.js'
import { friendlyZodMessage } from '../lib/friendlyError.js'
import type { CaseNumberSettings, FirmProfile, MatterTypeCode, ReminderSchedule } from '@hakios/types'

export const settingsRouter = Router()

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { rows } = await db.query<{ value: T }>('SELECT value FROM settings WHERE key = $1', [key])
  return rows[0]?.value ?? fallback
}

const FIRM_FALLBACK: FirmProfile = { firmName: '', address: '', phone: '', email: '' }
const CASE_NUMBER_FALLBACK: CaseNumberSettings = {
  firmPrefix: 'LF', includeTypeCode: true, includeYear: true, sequenceDigits: 5, separator: '/',
}

settingsRouter.get('/', requireAuth, async (_req, res, next) => {
  try {
    const [firm, caseNumber] = await Promise.all([
      getSetting<FirmProfile>('firm_profile', FIRM_FALLBACK),
      getSetting<CaseNumberSettings>('case_number', CASE_NUMBER_FALLBACK),
    ])
    res.json({ firm, caseNumber })
  } catch (err) {
    next(err)
  }
})

const firmSchema = z.object({
  firmName: z.string().max(100),
  address: z.string().max(500),
  phone: z.string().max(30),
  email: z.string().email().or(z.literal('')),
})

settingsRouter.put('/firm', requireAuth, requireRole('settings:manage'), async (req, res, next) => {
  try {
    const result = firmSchema.safeParse(req.body)
    if (!result.success) {
      return next(createError(friendlyZodMessage(result.error), 400, 'VALIDATION_ERROR'))
    }
    await db.query(
      `INSERT INTO settings (key, value, updated_by, updated_at)
       VALUES ('firm_profile', $1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = now()`,
      [JSON.stringify(result.data), req.user!.id],
    )
    res.json(result.data)
  } catch (err) {
    next(err)
  }
})

const caseNumberSchema = z.object({
  firmPrefix: z.string().min(1).max(6),
  includeTypeCode: z.boolean(),
  includeYear: z.boolean(),
  sequenceDigits: z.union([z.literal(4), z.literal(5), z.literal(6)]),
  separator: z.enum(['/', '-', '.']),
})

settingsRouter.put('/case-number', requireAuth, requireRole('settings:manage'), async (req, res, next) => {
  try {
    const result = caseNumberSchema.safeParse(req.body)
    if (!result.success) {
      return next(createError(friendlyZodMessage(result.error), 400, 'VALIDATION_ERROR'))
    }
    await db.query(
      `INSERT INTO settings (key, value, updated_by, updated_at)
       VALUES ('case_number', $1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = now()`,
      [JSON.stringify(result.data), req.user!.id],
    )
    res.json(result.data)
  } catch (err) {
    next(err)
  }
})

settingsRouter.get('/matter-types', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT code, label, is_active, created_at FROM matter_type_codes ORDER BY label',
    )
    res.json(
      rows.map((r: Record<string, unknown>) => ({
        code: r['code'],
        label: r['label'],
        isActive: r['is_active'],
        createdAt: (r['created_at'] as Date).toISOString(),
      })) as MatterTypeCode[],
    )
  } catch (err) {
    next(err)
  }
})

const matterTypeSchema = z.object({
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/, 'The matter type code can only use capital letters, numbers, and underscores (e.g. LIT_2024).'),
  label: z.string().min(1).max(100),
})

settingsRouter.post('/matter-types', requireAuth, requireRole('settings:manage'), async (req, res, next) => {
  try {
    const result = matterTypeSchema.safeParse(req.body)
    if (!result.success) {
      return next(createError(friendlyZodMessage(result.error), 400, 'VALIDATION_ERROR'))
    }
    const { code, label } = result.data
    const { rows } = await db.query<Record<string, unknown>>(
      `INSERT INTO matter_type_codes (code, label)
       VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING
       RETURNING code, label, is_active, created_at`,
      [code.toUpperCase(), label],
    )
    const r = rows[0]
    if (!r) return next(createError('Code already exists', 409, 'CONFLICT'))
    res.status(201).json({
      code: r['code'],
      label: r['label'],
      isActive: r['is_active'],
      createdAt: (r['created_at'] as Date).toISOString(),
    } as MatterTypeCode)
  } catch (err) {
    next(err)
  }
})

settingsRouter.patch('/matter-types/:code', requireAuth, requireRole('settings:manage'), async (req, res, next) => {
  try {
    const bodyResult = z.object({ isActive: z.boolean() }).safeParse(req.body)
    if (!bodyResult.success) {
      return next(createError('Something went wrong updating the status. Please try again.', 400, 'VALIDATION_ERROR'))
    }
    const { rows } = await db.query<Record<string, unknown>>(
      `UPDATE matter_type_codes SET is_active = $1
       WHERE code = $2
       RETURNING code, label, is_active, created_at`,
      [bodyResult.data.isActive, req.params['code']],
    )
    const r = rows[0]
    if (!r) return next(createError('Matter type not found', 404, 'NOT_FOUND'))
    res.json({
      code: r['code'],
      label: r['label'],
      isActive: r['is_active'],
      createdAt: (r['created_at'] as Date).toISOString(),
    } as MatterTypeCode)
  } catch (err) {
    next(err)
  }
})

function toReminderSchedule(r: Record<string, unknown>): ReminderSchedule {
  return {
    id: r['id'] as string,
    eventType: r['event_type'] as string,
    daysBefore: r['days_before'] as number,
    createdAt: (r['created_at'] as Date).toISOString(),
  }
}

settingsRouter.get('/reminder-schedules', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, event_type, days_before, created_at FROM reminder_schedules ORDER BY event_type, days_before',
    )
    res.json(rows.map(toReminderSchedule))
  } catch (err) {
    next(err)
  }
})

const reminderScheduleSchema = z.object({
  eventType: z.enum([
    'court_hearing',
    'filing_deadline',
    'submission_deadline',
    'mention',
    'client_meeting',
    'internal_review',
  ]),
  daysBefore: z.number().int().min(1).max(365),
})

settingsRouter.post('/reminder-schedules', requireAuth, requireRole('settings:manage'), async (req, res, next) => {
  try {
    const result = reminderScheduleSchema.safeParse(req.body)
    if (!result.success) {
      return next(
        createError(friendlyZodMessage(result.error), 400, 'VALIDATION_ERROR'),
      )
    }
    const { rows } = await db.query<Record<string, unknown>>(
      `INSERT INTO reminder_schedules (event_type, days_before)
       VALUES ($1, $2)
       ON CONFLICT (event_type, days_before) DO NOTHING
       RETURNING id, event_type, days_before, created_at`,
      [result.data.eventType, result.data.daysBefore],
    )
    const r = rows[0]
    if (!r) return next(createError('Schedule already exists', 409, 'CONFLICT'))
    res.status(201).json(toReminderSchedule(r))
  } catch (err) {
    next(err)
  }
})

settingsRouter.delete('/reminder-schedules/:id', requireAuth, requireRole('settings:manage'), async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM reminder_schedules WHERE id = $1',
      [req.params['id']],
    )
    if ((rowCount ?? 0) === 0) return next(createError('Schedule not found', 404, 'NOT_FOUND'))
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
