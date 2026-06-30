import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { db } from '../db/client.js'
import { hashPassword } from '../lib/password.js'
import { signAccessToken } from '../lib/jwt.js'

const app = createApp()
let adminToken: string
let partnerToken: string
let createdUserId: string

beforeAll(async () => {
  const hash = await hashPassword('Test@1234!')
  const { rows: a } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ('admin@users.test', $1, 'Admin', 'UTest', 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1 RETURNING id`,
    [hash],
  )
  adminToken = signAccessToken(a[0]!.id, 'admin')

  const { rows: p } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ('partner@users.test', $1, 'Partner', 'UTest', 'partner')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1 RETURNING id`,
    [hash],
  )
  partnerToken = signAccessToken(p[0]!.id, 'partner')
})

afterAll(async () => {
  if (createdUserId) await db.query('DELETE FROM users WHERE id = $1', [createdUserId])
  await db.query("DELETE FROM users WHERE email IN ('admin@users.test','partner@users.test','invited@users.test')")
  await db.end()
})

describe('GET /api/users', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/users')
    expect(res.status).toBe(401)
  })

  it('returns 403 for partner', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${partnerToken}`)
    expect(res.status).toBe(403)
  })

  it('returns user list for admin', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const u = (res.body as Record<string, unknown>[]).find((x) => x['email'] === 'admin@users.test')
    expect(u).toBeDefined()
    expect(u?.['firstName']).toBe('Admin')
    expect(typeof u?.['isActive']).toBe('boolean')
  })
})

describe('POST /api/users', () => {
  it('returns 403 for partner', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ email: 'invited@users.test', firstName: 'Invited', lastName: 'UTest', role: 'associate' })
    expect(res.status).toBe(403)
  })

  it('creates user and returns 201 for admin', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'invited@users.test', firstName: 'Invited', lastName: 'UTest', role: 'associate' })
    expect(res.status).toBe(201)
    expect((res.body as Record<string, unknown>)['email']).toBe('invited@users.test')
    createdUserId = (res.body as Record<string, unknown>)['id'] as string
  })

  it('returns 400 for invalid role', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'x@users.test', firstName: 'X', lastName: 'X', role: 'admin' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/users/:id/status', () => {
  it('returns 403 for partner', async () => {
    const res = await request(app)
      .patch(`/api/users/${createdUserId}/status`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ isActive: false })
    expect(res.status).toBe(403)
  })

  it('deactivates user for admin', async () => {
    const res = await request(app)
      .patch(`/api/users/${createdUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
    expect(res.status).toBe(200)
    expect((res.body as Record<string, unknown>)['isActive']).toBe(false)
  })

  it('reactivates user for admin', async () => {
    const res = await request(app)
      .patch(`/api/users/${createdUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
    expect(res.status).toBe(200)
    expect((res.body as Record<string, unknown>)['isActive']).toBe(true)
  })

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .patch('/api/users/00000000-0000-0000-0000-000000000000/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
    expect(res.status).toBe(404)
  })
})
