import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { db } from '../db/client.js'
import { createError } from '../middleware/errorHandler.js'
import type { CaseNumberSettings, FirmProfile, MatterTypeCode } from '@hakios/types'

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
      return next(createError(result.error.errors[0]?.message ?? 'Validation error', 400, 'VALIDATION_ERROR'))
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
      return next(createError(result.error.errors[0]?.message ?? 'Validation error', 400, 'VALIDATION_ERROR'))
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
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/, 'Code must be uppercase letters, digits, or underscores'),
  label: z.string().min(1).max(100),
})

settingsRouter.post('/matter-types', requireAuth, requireRole('settings:manage'), async (req, res, next) => {
  try {
    const result = matterTypeSchema.safeParse(req.body)
    if (!result.success) {
      return next(createError(result.error.errors[0]?.message ?? 'Validation error', 400, 'VALIDATION_ERROR'))
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
      return next(createError('isActive must be a boolean', 400, 'VALIDATION_ERROR'))
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
