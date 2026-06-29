import type { Express } from 'express'
import { authRouter } from './auth.js'
import { pushRouter } from './push.js'

export function registerRoutes(app: Express): void {
  app.use('/auth', authRouter)
  app.use('/push', pushRouter)
}
