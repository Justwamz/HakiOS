import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { createError } from '../middleware/errorHandler.js'

export const pushRouter = Router()

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

pushRouter.post('/subscribe', requireAuth, async (req, res, next) => {
  try {
    const parsed = subscriptionSchema.safeParse(req.body)
    if (!parsed.success) throw createError('Invalid subscription payload', 400)

    const { endpoint, keys } = parsed.data
    await db.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, endpoint) DO NOTHING`,
      [req.user!.id, endpoint, keys.p256dh, keys.auth],
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

pushRouter.delete('/subscribe', requireAuth, async (req, res, next) => {
  try {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body)
    await db.query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [req.user!.id, endpoint],
    )
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
