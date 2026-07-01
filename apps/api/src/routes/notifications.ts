import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import { createError } from '../middleware/errorHandler.js'
import * as notifService from '../services/notifications.js'

export const notificationsRouter = Router()

notificationsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const notifications = await notifService.listNotifications(req.user!.id)
    res.json(notifications)
  } catch (err) {
    next(err)
  }
})

notificationsRouter.get('/count', requireAuth, async (req, res, next) => {
  try {
    const count = await notifService.unreadCount(req.user!.id)
    res.json({ count })
  } catch (err) {
    next(err)
  }
})

// /read-all MUST be registered before /:id/read
notificationsRouter.patch('/read-all', requireAuth, async (req, res, next) => {
  try {
    await notifService.markAllRead(req.user!.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

notificationsRouter.patch('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const notification = await notifService.markRead(req.params['id']!, req.user!.id)
    if (!notification) return next(createError('Notification not found', 404, 'NOT_FOUND'))
    res.json(notification)
  } catch (err) {
    next(err)
  }
})
