import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { errorHandler, notFound } from './middleware/errorHandler.js'
import { registerRoutes } from './routes/index.js'

export function createBaseApp() {
  const app = express()

  app.use(helmet())
  app.use(cors({
    origin: process.env['APP_URL'] ?? 'http://localhost:5173',
    credentials: true,
  }))
  app.use(express.json())

  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      skip: () => process.env['NODE_ENV'] === 'test',
      message: { error: 'Too many attempts, please try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  )

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  registerRoutes(app)

  return app
}

export function createApp() {
  const app = createBaseApp()
  app.use(notFound)
  app.use(errorHandler)
  return app
}
