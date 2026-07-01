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

describe('Reminder Schedules', () => {
  let createdScheduleId: string

  afterAll(async () => {
    if (createdScheduleId) {
      await db.query('DELETE FROM reminder_schedules WHERE id = $1', [createdScheduleId])
    }
  })

  it('GET /api/settings/reminder-schedules returns an array', async () => {
    const res = await request(app)
      .get('/api/settings/reminder-schedules')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('POST /api/settings/reminder-schedules creates a schedule', async () => {
    const res = await request(app)
      .post('/api/settings/reminder-schedules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventType: 'court_hearing', daysBefore: 3 })
    // 201 or 409 if it already exists
    expect([201, 409]).toContain(res.status)
    if (res.status === 201) {
      expect((res.body as Record<string, unknown>)['eventType']).toBe('court_hearing')
      expect((res.body as Record<string, unknown>)['daysBefore']).toBe(3)
      expect((res.body as Record<string, unknown>)['createdAt']).toBeDefined()
      createdScheduleId = (res.body as Record<string, unknown>)['id'] as string
    }
  })

  it('POST /api/settings/reminder-schedules returns 409 on duplicate', async () => {
    // Create first
    const r1 = await request(app)
      .post('/api/settings/reminder-schedules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventType: 'filing_deadline', daysBefore: 7 })
    if (r1.status === 201) {
      await db.query('DELETE FROM reminder_schedules WHERE id = $1', [(r1.body as Record<string, unknown>)['id']])
    }
    // Ensure it exists
    await db.query(
      `INSERT INTO reminder_schedules (event_type, days_before) VALUES ('filing_deadline', 7)
       ON CONFLICT DO NOTHING`,
    )
    const r2 = await request(app)
      .post('/api/settings/reminder-schedules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventType: 'filing_deadline', daysBefore: 7 })
    expect(r2.status).toBe(409)
    await db.query(
      `DELETE FROM reminder_schedules WHERE event_type = 'filing_deadline' AND days_before = 7`,
    )
  })

  it('DELETE /api/settings/reminder-schedules/:id deletes a schedule', async () => {
    const { rows } = await db.query<Record<string, unknown>>(
      `INSERT INTO reminder_schedules (event_type, days_before) VALUES ('mention', 1) RETURNING id`,
    )
    const r = rows[0]
    if (!r) throw new Error('Setup failed')
    const id = r['id'] as string
    const res = await request(app)
      .delete(`/api/settings/reminder-schedules/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(204)
  })
})
