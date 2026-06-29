import type { Express } from 'express'
import { authRouter } from './auth.js'

export function registerRoutes(app: Express): void {
  app.use('/auth', authRouter)
}
