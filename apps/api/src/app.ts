import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { errorHandler, notFound } from './middleware/errorHandler.js'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(cors({
    origin: process.env['APP_URL'] ?? 'http://localhost:5173',
    credentials: true,
  }))
  app.use(express.json())

  // Auth routes are rate-limited more strictly (added in Plan 1b)
  app.use(
    '/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: { error: 'Too many attempts, please try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  )

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use(notFound)
  app.use(errorHandler)

  return app
}
