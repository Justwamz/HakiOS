import type { Express } from 'express'
import { authRouter } from './auth.js'
import { pushRouter } from './push.js'
import { clientsRouter } from './clients.js'
import { mattersRouter } from './matters.js'
import { usersRouter } from './users.js'

export function registerRoutes(app: Express): void {
  app.use('/auth', authRouter)
  app.use('/push', pushRouter)
  app.use('/clients', clientsRouter)
  app.use('/matters', mattersRouter)
  app.use('/users', usersRouter)
}
