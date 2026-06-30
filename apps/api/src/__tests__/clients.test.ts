import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { db } from '../db/client.js'
import { hashPassword } from '../lib/password.js'
import { signAccessToken } from '../lib/jwt.js'

const app = createApp()
let adminId: string
let adminToken: string
let clerkToken: string
let createdClientId: string

beforeAll(async () => {
  const hash = await hashPassword('Test@1234!')
  const { rows: a } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ('admin@clients.test', $1, 'Admin', 'CTest', 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1 RETURNING id`,
    [hash],
  )
  adminId = a[0]!.id
  adminToken = signAccessToken(adminId, 'admin')

  const { rows: c } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ('clerk@clients.test', $1, 'Clerk', 'CTest', 'clerk')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1 RETURNING id`,
    [hash],
  )
  clerkToken = signAccessToken(c[0]!.id, 'clerk')
})

afterAll(async () => {
  if (createdClientId) await db.query('DELETE FROM clients WHERE id = $1', [createdClientId])
  await db.query("DELETE FROM users WHERE email IN ('admin@clients.test','clerk@clients.test')")
  await db.end()
})

describe('POST /clients', () => {
  it('creates a client and returns 201 for admin', async () => {
    const res = await request(app)
      .post('/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientType: 'individual', fullName: 'Jane Doe', phone: '+254700000001' })
    expect(res.status).toBe(201)
    expect(res.body.clientId).toMatch(/^CLT-\d{4}-\d{5}$/)
    expect(res.body.fullName).toBe('Jane Doe')
    createdClientId = res.body.id as string
  })

  it('returns 403 for clerk', async () => {
    const res = await request(app)
      .post('/clients')
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ clientType: 'individual', fullName: 'Nope' })
    expect(res.status).toBe(403)
  })

  it('returns 400 for missing fullName', async () => {
    const res = await request(app)
      .post('/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientType: 'individual' })
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/clients')
      .send({ clientType: 'individual', fullName: 'Test' })
    expect(res.status).toBe(401)
  })
})

describe('GET /clients', () => {
  it('returns paginated list with items and total for admin', async () => {
    const res = await request(app)
      .get('/clients')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
    expect(typeof res.body.total).toBe('number')
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/clients')
    expect(res.status).toBe(401)
  })
})

describe('GET /clients/:id', () => {
  it('returns client for admin', async () => {
    const res = await request(app)
      .get(`/clients/${createdClientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(createdClientId)
  })

  it('returns 404 for unknown UUID', async () => {
    const res = await request(app)
      .get('/clients/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })
})

describe('PUT /clients/:id', () => {
  it('updates client for admin and returns 200', async () => {
    const res = await request(app)
      .put(`/clients/${createdClientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fullName: 'Jane Doe Updated', status: 'dormant' })
    expect(res.status).toBe(200)
    expect(res.body.fullName).toBe('Jane Doe Updated')
    expect(res.body.status).toBe('dormant')
  })

  it('returns 403 for clerk', async () => {
    const res = await request(app)
      .put(`/clients/${createdClientId}`)
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ fullName: 'Hack' })
    expect(res.status).toBe(403)
  })
})
