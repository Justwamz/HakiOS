import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createApp, createBaseApp } from '../app.js'
import { signAccessToken } from '../lib/jwt.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import { errorHandler, notFound } from '../middleware/errorHandler.js'

const app = createBaseApp()

// Mount test-only protected routes on the existing app
const testRouter = express.Router()
testRouter.get('/protected', requireAuth, (_req, res) => res.json({ ok: true }))
testRouter.get(
  '/admin-only',
  requireAuth,
  requireRole('settings:manage'),
  (_req, res) => res.json({ ok: true }),
)
app.use('/test', testRouter)

// Apply error handlers after test routes
app.use(notFound)
app.use(errorHandler)

describe('requireAuth middleware', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/test/protected')
    expect(res.status).toBe(401)
  })

  it('returns 401 with a malformed token', async () => {
    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', 'Bearer notavalidtoken')
    expect(res.status).toBe(401)
  })

  it('allows request with valid access token', async () => {
    const token = signAccessToken('user-abc', 'associate')
    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})

describe('requireRole middleware', () => {
  it('returns 403 when role lacks permission', async () => {
    const token = signAccessToken('user-abc', 'clerk')
    const res = await request(app)
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })

  it('allows admin to access admin-only route', async () => {
    const token = signAccessToken('user-abc', 'admin')
    const res = await request(app)
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})
