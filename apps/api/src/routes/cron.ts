import { Router } from 'express'
import { createError } from '../middleware/errorHandler.js'
import { runReminders } from '../services/reminders.js'

export const cronRouter = Router()

cronRouter.post('/run-reminders', async (req, res, next) => {
  try {
    const secret = process.env['CRON_SECRET']
    if (!secret) return next(createError('Cron not configured', 403, 'FORBIDDEN'))
    const provided = req.headers['x-cron-secret']
    if (provided !== secret) return next(createError('Unauthorized', 401, 'UNAUTHORIZED'))
    const result = await runReminders()
    res.json({ ok: true, ...result })
  } catch (err) {
    next(err)
  }
})
