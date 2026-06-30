import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { db } from '../db/client.js'
import * as authService from '../services/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { emailSchema } from '@hakios/utils'
import type { Role } from '@hakios/types'

export const usersRouter = Router()

usersRouter.get('/assignable', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, first_name, last_name, role
       FROM users WHERE is_active = true AND role IN ('partner', 'associate', 'clerk') ORDER BY first_name, last_name`,
    )
    res.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r['id'],
        email: r['email'],
        firstName: r['first_name'],
        lastName: r['last_name'],
        role: r['role'],
      })),
    )
  } catch (err) {
    next(err)
  }
})

usersRouter.get('/', requireAuth, requireRole('users:manage'), async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at
       FROM users ORDER BY first_name, last_name`,
    )
    res.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r['id'],
        email: r['email'],
        firstName: r['first_name'],
        lastName: r['last_name'],
        role: r['role'],
        isActive: r['is_active'],
        createdAt: (r['created_at'] as Date).toISOString(),
        updatedAt: (r['updated_at'] as Date).toISOString(),
      })),
    )
  } catch (err) {
    next(err)
  }
})

usersRouter.post('/', requireAuth, requireRole('users:manage'), async (req, res, next) => {
  try {
    const bodySchema = z.object({
      email: emailSchema,
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      role: z.enum(['partner', 'associate', 'clerk']),
    })
    const result = bodySchema.safeParse(req.body)
    if (!result.success) {
      return next(createError(result.error.errors[0]?.message ?? 'Validation error', 400, 'VALIDATION_ERROR'))
    }
    const { email, firstName, lastName, role } = result.data
    const user = await authService.createUser({ email, firstName, lastName, role: role as Role })
    res.status(201).json(user)
  } catch (err) {
    next(err)
  }
})

usersRouter.patch('/:id/status', requireAuth, requireRole('users:manage'), async (req, res, next) => {
  try {
    const bodySchema = z.object({ isActive: z.boolean() })
    const result = bodySchema.safeParse(req.body)
    if (!result.success) {
      return next(createError('isActive must be a boolean', 400, 'VALIDATION_ERROR'))
    }
    const { isActive } = result.data
    const { rows } = await db.query<Record<string, unknown>>(
      `UPDATE users SET is_active = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, email, first_name, last_name, role, is_active, created_at, updated_at`,
      [isActive, req.params['id']],
    )
    const row = rows[0]
    if (!row) return next(createError('User not found', 404, 'NOT_FOUND'))
    res.json({
      id: row['id'],
      email: row['email'],
      firstName: row['first_name'],
      lastName: row['last_name'],
      role: row['role'],
      isActive: row['is_active'],
      createdAt: (row['created_at'] as Date).toISOString(),
      updatedAt: (row['updated_at'] as Date).toISOString(),
    })
  } catch (err) {
    next(err)
  }
})
