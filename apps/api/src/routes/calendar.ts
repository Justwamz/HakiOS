import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { createError } from '../middleware/errorHandler.js'
import { hasPermission } from '@hakios/types'
import * as calendarService from '../services/calendar.js'
import type { EventType } from '@hakios/types'

export const calendarRouter = Router()

const eventTypeEnum = z.enum([
  'court_hearing',
  'filing_deadline',
  'submission_deadline',
  'mention',
  'client_meeting',
  'internal_review',
])

const createSchema = z.object({
  eventType: eventTypeEnum,
  title: z.string().min(1).max(200),
  matterId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'time must be HH:MM').optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
  supervisingPartnerId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
  recurrence: z.enum(['none', 'weekly', 'monthly']).optional(),
})

const updateSchema = z.object({
  eventType: eventTypeEnum.optional(),
  title: z.string().min(1).max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
  supervisingPartnerId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

calendarRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const canReadAll = hasPermission(req.user!.role, 'calendar:read_all')
    const canReadAssigned = hasPermission(req.user!.role, 'calendar:read_assigned')
    if (!canReadAll && !canReadAssigned) {
      return next(createError('Forbidden', 403, 'FORBIDDEN'))
    }
    const q = req.query as Record<string, string>
    const events = await calendarService.listEvents({
      from: q['from'],
      to: q['to'],
      matterId: q['matterId'],
      eventType: q['eventType'] as EventType | undefined,
      includeResolved: q['includeResolved'] === 'true',
      userId: canReadAll ? undefined : req.user!.id,
    })
    res.json(events)
  } catch (err) {
    next(err)
  }
})

calendarRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    if (!hasPermission(req.user!.role, 'calendar:create')) {
      return next(createError('Forbidden', 403, 'FORBIDDEN'))
    }
    const result = createSchema.safeParse(req.body)
    if (!result.success) {
      return next(
        createError(result.error.errors[0]?.message ?? 'Validation error', 400, 'VALIDATION_ERROR'),
      )
    }
    const event = await calendarService.createEvent(result.data, req.user!.id)
    res.status(201).json(event)
  } catch (err) {
    next(err)
  }
})

calendarRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const event = await calendarService.getEvent(req.params['id']!)
    if (!event) return next(createError('Event not found', 404, 'NOT_FOUND'))
    const canReadAll = hasPermission(req.user!.role, 'calendar:read_all')
    if (!canReadAll && !event.assigneeIds.includes(req.user!.id)) {
      return next(createError('Forbidden', 403, 'FORBIDDEN'))
    }
    res.json(event)
  } catch (err) {
    next(err)
  }
})

calendarRouter.put('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!hasPermission(req.user!.role, 'calendar:create')) {
      return next(createError('Forbidden', 403, 'FORBIDDEN'))
    }
    const current = await calendarService.getEvent(req.params['id']!)
    if (!current) return next(createError('Event not found', 404, 'NOT_FOUND'))
    if (current.isResolved) {
      return next(createError('Cannot edit a resolved event', 400, 'EVENT_RESOLVED'))
    }
    const result = updateSchema.safeParse(req.body)
    if (!result.success) {
      return next(
        createError(result.error.errors[0]?.message ?? 'Validation error', 400, 'VALIDATION_ERROR'),
      )
    }
    const updated = await calendarService.updateEvent(req.params['id']!, result.data)
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

calendarRouter.patch('/:id/resolve', requireAuth, async (req, res, next) => {
  try {
    if (!hasPermission(req.user!.role, 'calendar:create')) {
      return next(createError('Forbidden', 403, 'FORBIDDEN'))
    }
    const event = await calendarService.resolveEvent(req.params['id']!)
    if (!event) return next(createError('Event not found', 404, 'NOT_FOUND'))
    res.json(event)
  } catch (err) {
    next(err)
  }
})

calendarRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!hasPermission(req.user!.role, 'calendar:create')) {
      return next(createError('Forbidden', 403, 'FORBIDDEN'))
    }
    const deleted = await calendarService.deleteEvent(req.params['id']!)
    if (!deleted) return next(createError('Event not found', 404, 'NOT_FOUND'))
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
