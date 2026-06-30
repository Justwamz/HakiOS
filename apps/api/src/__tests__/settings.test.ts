import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { db } from '../db/client.js'
import { hashPassword } from '../lib/password.js'
import { signAccessToken } from '../lib/jwt.js'

const app = createApp()
let adminToken: string
let partnerToken: string

beforeAll(async () => {
  const hash = await hashPassword('Test@1234!')
  const { rows: a } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ('admin@settings.test', $1, 'Admin', 'STest', 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1 RETURNING id`,
    [hash],
  )
  adminToken = signAccessToken(a[0]!.id, 'admin')

  const { rows: p } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ('partner@settings.test', $1, 'Partner', 'STest', 'partner')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1 RETURNING id`,
    [hash],
  )
  partnerToken = signAccessToken(p[0]!.id, 'partner')
})

afterAll(async () => {
  await db.query("DELETE FROM matter_type_codes WHERE code = 'TESTCODE'")
  await db.query("DELETE FROM users WHERE email IN ('admin@settings.test','partner@settings.test')")
  await db.end()
})

describe('GET /api/settings', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/settings')
    expect(res.status).toBe(401)
  })

  it('returns firm and caseNumber for admin', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('firm')
    expect(res.body).toHaveProperty('caseNumber')
  })

  it('returns settings for partner', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${partnerToken}`)
    expect(res.status).toBe(200)
  })
})

describe('PUT /api/settings/firm', () => {
  it('returns 403 for partner', async () => {
    const res = await request(app)
      .put('/api/settings/firm')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ firmName: 'Test Firm', address: '', phone: '', email: '' })
    expect(res.status).toBe(403)
  })

  it('updates firm settings for admin', async () => {
    const res = await request(app)
      .put('/api/settings/firm')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ firmName: 'Test Firm Ltd', address: 'Nairobi', phone: '+254700000000', email: 'firm@test.com' })
    expect(res.status).toBe(200)
    expect((res.body as Record<string, unknown>)['firmName']).toBe('Test Firm Ltd')
  })
})

describe('PUT /api/settings/case-number', () => {
  it('updates case number settings for admin', async () => {
    const res = await request(app)
      .put('/api/settings/case-number')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ firmPrefix: 'JTL', includeTypeCode: true, includeYear: true, sequenceDigits: 5, separator: '/' })
    expect(res.status).toBe(200)
    expect((res.body as Record<string, unknown>)['firmPrefix']).toBe('JTL')
  })

  it('returns 400 for invalid sequenceDigits', async () => {
    const res = await request(app)
      .put('/api/settings/case-number')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ firmPrefix: 'JTL', includeTypeCode: true, includeYear: true, sequenceDigits: 3, separator: '/' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/settings/matter-types', () => {
  it('returns all matter types for partner', async () => {
    const res = await request(app)
      .get('/api/settings/matter-types')
      .set('Authorization', `Bearer ${partnerToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const item = (res.body as Record<string, unknown>[])[0]
    expect(item).toHaveProperty('isActive')
  })
})

describe('POST /api/settings/matter-types', () => {
  it('returns 403 for partner', async () => {
    const res = await request(app)
      .post('/api/settings/matter-types')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ code: 'TESTCODE', label: 'Test Type' })
    expect(res.status).toBe(403)
  })

  it('creates matter type for admin', async () => {
    const res = await request(app)
      .post('/api/settings/matter-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'TESTCODE', label: 'Test Type' })
    expect(res.status).toBe(201)
    expect((res.body as Record<string, unknown>)['code']).toBe('TESTCODE')
  })
})

describe('PATCH /api/settings/matter-types/:code', () => {
  it('deactivates matter type for admin', async () => {
    const res = await request(app)
      .patch('/api/settings/matter-types/TESTCODE')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
    expect(res.status).toBe(200)
    expect((res.body as Record<string, unknown>)['isActive']).toBe(false)
  })
})
