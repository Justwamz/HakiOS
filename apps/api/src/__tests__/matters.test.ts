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
let testClientId: string
let createdMatterId: string

beforeAll(async () => {
  const hash = await hashPassword('Test@1234!')

  const { rows: a } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ('admin@matters.test', $1, 'Admin', 'MTest', 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1 RETURNING id`,
    [hash],
  )
  adminId = a[0]!.id
  adminToken = signAccessToken(adminId, 'admin')

  const { rows: c } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ('clerk@matters.test', $1, 'Clerk', 'MTest', 'clerk')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1 RETURNING id`,
    [hash],
  )
  clerkToken = signAccessToken(c[0]!.id, 'clerk')

  const year = new Date().getFullYear()
  const { rows: cl } = await db.query<{ id: string }>(
    `INSERT INTO clients (client_id, client_type, full_name, created_by, updated_by)
     VALUES ($1, 'individual', 'Matter Test Client', $2, $2) RETURNING id`,
    [`CLT-${year}-99998`, adminId],
  )
  testClientId = cl[0]!.id
})

afterAll(async () => {
  if (createdMatterId) await db.query('DELETE FROM matters WHERE id = $1', [createdMatterId])
  if (testClientId) await db.query('DELETE FROM clients WHERE id = $1', [testClientId])
  await db.query("DELETE FROM users WHERE email IN ('admin@matters.test','clerk@matters.test')")
  await db.end()
})

describe('POST /matters', () => {
  it('creates a matter and returns 201 for admin', async () => {
    const res = await request(app)
      .post('/matters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientId: testClientId, matterType: 'LIT', description: 'Test litigation matter' })
    expect(res.status).toBe(201)
    expect(res.body.matterNumber).toMatch(/^LF/)
    expect(res.body.description).toBe('Test litigation matter')
    expect(Array.isArray(res.body.clerkIds)).toBe(true)
    createdMatterId = res.body.id as string
  })

  it('returns 403 for clerk', async () => {
    const res = await request(app)
      .post('/matters')
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ clientId: testClientId, matterType: 'LIT', description: 'x' })
    expect(res.status).toBe(403)
  })

  it('returns 400 for missing description', async () => {
    const res = await request(app)
      .post('/matters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientId: testClientId, matterType: 'LIT' })
    expect(res.status).toBe(400)
  })
})

describe('GET /matters', () => {
  it('returns paginated list for admin', async () => {
    const res = await request(app)
      .get('/matters')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
    expect(typeof res.body.total).toBe('number')
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/matters')
    expect(res.status).toBe(401)
  })
})

describe('GET /matters/types', () => {
  it('returns matter type codes for authenticated user', async () => {
    const res = await request(app)
      .get('/matters/types')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0]).toHaveProperty('code')
    expect(res.body[0]).toHaveProperty('label')
  })
})

describe('GET /matters/:id', () => {
  it('returns matter with clerkIds array for admin', async () => {
    const res = await request(app)
      .get(`/matters/${createdMatterId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(createdMatterId)
    expect(Array.isArray(res.body.clerkIds)).toBe(true)
  })

  it('returns 404 for unknown UUID', async () => {
    const res = await request(app)
      .get('/matters/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })
})

describe('PUT /matters/:id', () => {
  it('updates matter and returns 200', async () => {
    const res = await request(app)
      .put(`/matters/${createdMatterId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Updated description', status: 'pending' })
    expect(res.status).toBe(200)
    expect(res.body.description).toBe('Updated description')
    expect(res.body.status).toBe('pending')
  })
})

describe('POST /matters/:id/close', () => {
  it('closes matter and returns status closed', async () => {
    const res = await request(app)
      .post(`/matters/${createdMatterId}/close`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ closureNote: 'Resolved amicably' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('closed')
    expect(res.body.dateClosed).toBeTruthy()
  })

  it('returns 409 for already-closed matter', async () => {
    const res = await request(app)
      .post(`/matters/${createdMatterId}/close`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
    expect(res.status).toBe(409)
  })
})

describe('GET /users/assignable', () => {
  it('returns active users for authenticated request', async () => {
    const res = await request(app)
      .get('/users/assignable')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})
