import type { Express } from 'express'
import { authRouter } from './auth.js'
import { pushRouter } from './push.js'
import { clientsRouter } from './clients.js'
import { mattersRouter } from './matters.js'
import { usersRouter } from './users.js'
import { setupRouter } from './setup.js'
import { settingsRouter } from './settings.js'
import { calendarRouter } from './calendar.js'
import { notificationsRouter } from './notifications.js'

export function registerRoutes(app: Express): void {
  app.use('/api/auth', authRouter)
  app.use('/api/push', pushRouter)
  app.use('/api/clients', clientsRouter)
  app.use('/api/matters', mattersRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/setup', setupRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api/calendar', calendarRouter)
  app.use('/api/notifications', notificationsRouter)
}
