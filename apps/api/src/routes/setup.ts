import { Router } from 'express'
import bcrypt from 'bcrypt'
import { db } from '../db/client.js'
import { createError } from '../middleware/errorHandler.js'

export const setupRouter = Router()

setupRouter.post('/', async (req, res, next) => {
  try {
    const setupKey = process.env['SETUP_KEY']
    if (!setupKey) return next(createError('Setup not enabled', 403, 'FORBIDDEN'))

    const { key, email, password, firstName, lastName } = req.body as {
      key: string; email: string; password: string
      firstName: string; lastName: string
    }

    if (!key || key !== setupKey) {
      return next(createError('Invalid setup key', 403, 'FORBIDDEN'))
    }

    if (!email || !password || !firstName || !lastName) {
      return next(createError('Missing required fields', 400, 'BAD_REQUEST'))
    }

    // Disable if any admin already exists
    const existing = await db.query(
      `SELECT id FROM users WHERE role = 'admin' LIMIT 1`
    )
    if ((existing.rowCount ?? 0) > 0) {
      return next(createError('Setup already complete', 403, 'FORBIDDEN'))
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const result = await db.query(
      `INSERT INTO users (id, email, first_name, last_name, role, password_hash, is_active)
       VALUES (gen_random_uuid(), $1, $2, $3, 'admin', $4, true)
       RETURNING id, email`,
      [email, firstName, lastName, passwordHash]
    )

    res.status(201).json({ message: 'Admin created', user: result.rows[0] })
  } catch (err) {
    next(err)
  }
})
