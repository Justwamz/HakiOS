import { Router } from 'express'
import { z } from 'zod'
import { hasPermission } from '@hakios/types'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { createError } from '../middleware/errorHandler.js'
import * as mattersService from '../services/matters.js'
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
    const user = req.user
    if (!user) return next(createError('Unauthorized', 401, 'UNAUTHORIZED'))
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
    const user = req.user
    if (!user) return next(createError('Unauthorized', 401, 'UNAUTHORIZED'))
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return next(createError('Invalid request body', 400))
    const matter = await mattersService.createMatter(parsed.data, user.id)
    res.status(201).json(matter)
  } catch (err) {
    next(err)
  }
})

mattersRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user
    if (!user) return next(createError('Unauthorized', 401, 'UNAUTHORIZED'))
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
    const user = req.user
    if (!user) return next(createError('Unauthorized', 401, 'UNAUTHORIZED'))
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) return next(createError('Invalid request body', 400))
    const after = await mattersService.updateMatter(req.params['id']!, parsed.data, user.id)
    res.json(after)
  } catch (err) {
    next(err)
  }
})

mattersRouter.post('/:id/close', requireAuth, requireRole('matters:close'), async (req, res, next) => {
  try {
    const user = req.user
    if (!user) return next(createError('Unauthorized', 401, 'UNAUTHORIZED'))
    const parsed = closeSchema.safeParse(req.body)
    if (!parsed.success) return next(createError('Invalid request body', 400))
    const after = await mattersService.closeMatter(req.params['id']!, parsed.data, user.id)
    res.json(after)
  } catch (err) {
    next(err)
  }
})
