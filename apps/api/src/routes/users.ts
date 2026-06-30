import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { db } from '../db/client.js'

export const usersRouter = Router()

usersRouter.get('/assignable', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, first_name, last_name, role
       FROM users WHERE is_active = true ORDER BY first_name, last_name`,
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
