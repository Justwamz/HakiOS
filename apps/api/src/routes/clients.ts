import { Router } from 'express'
import { z } from 'zod'
import { hasPermission } from '@hakios/types'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { createError } from '../middleware/errorHandler.js'
import * as clientsService from '../services/clients.js'

export const clientsRouter = Router()

const createSchema = z.object({
  clientType: z.enum(['individual', 'corporate']),
  fullName: z.string().min(1).max(255),
  idNumber: z.string().max(50).optional(),
  contactPerson: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  postalAddress: z.string().max(500).optional(),
  kraPin: z.string().max(50).optional(),
  hasConflict: z.boolean().optional(),
  conflictNotes: z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
})

const updateSchema = createSchema
  .omit({ clientType: true })
  .extend({ status: z.enum(['active', 'dormant', 'closed']).optional() })
  .partial()

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['active', 'dormant', 'closed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

clientsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = req.user
    if (!user) return next(createError('Authentication required', 401, 'UNAUTHENTICATED'))
    const canReadAll = hasPermission(user.role, 'clients:read_all')
    if (!canReadAll && !hasPermission(user.role, 'clients:read_assigned')) {
      return next(createError('Insufficient permissions', 403, 'FORBIDDEN'))
    }
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) return next(createError('Invalid query parameters', 400))
    const result = await clientsService.listClients({ ...parsed.data, userId: user.id, canReadAll })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

clientsRouter.post('/', requireAuth, requireRole('clients:create'), async (req, res, next) => {
  try {
    const user = req.user
    if (!user) return next(createError('Authentication required', 401, 'UNAUTHENTICATED'))
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return next(createError('Invalid request body', 400))
    const client = await clientsService.createClient(parsed.data, user.id)
    res.status(201).json(client)
  } catch (err) {
    next(err)
  }
})

clientsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user
    if (!user) return next(createError('Authentication required', 401, 'UNAUTHENTICATED'))
    const canReadAll = hasPermission(user.role, 'clients:read_all')
    const canReadAssigned = hasPermission(user.role, 'clients:read_assigned')
    if (!canReadAll && !canReadAssigned) {
      return next(createError('Insufficient permissions', 403, 'FORBIDDEN'))
    }
    const client = await clientsService.getClient(req.params['id']!)
    if (!canReadAll) {
      const ok = await clientsService.userCanAccessClient(user.id, client.id)
      if (!ok) return next(createError('Insufficient permissions', 403, 'FORBIDDEN'))
    }
    res.json(client)
  } catch (err) {
    next(err)
  }
})

clientsRouter.put('/:id', requireAuth, requireRole('clients:edit'), async (req, res, next) => {
  try {
    const user = req.user
    if (!user) return next(createError('Authentication required', 401, 'UNAUTHENTICATED'))
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) return next(createError('Invalid request body', 400))
    const after = await clientsService.updateClient(req.params['id']!, parsed.data, user.id)
    res.json(after)
  } catch (err) {
    next(err)
  }
})
