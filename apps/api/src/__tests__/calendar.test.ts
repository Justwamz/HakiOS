import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { randomUUID } from 'crypto'
import bcrypt from 'bcrypt'
import { createApp } from '../app.js'
import { db } from '../db/client.js'

const app = createApp()

let adminToken: string
let matterId: string
const testEmail = `cal-${randomUUID()}@test.com`

beforeAll(async () => {
  const hash = await bcrypt.hash('TestPass1!', 12)
  const userId = randomUUID()

  await db.query(
    `INSERT INTO users (id, email, first_name, last_name, role, password_hash, is_active)
     VALUES ($1, $2, 'Cal', 'Admin', 'admin', $3, true)`,
    [userId, testEmail, hash],
  )

  await db.query(
    `INSERT INTO matter_type_codes (code, label) VALUES ('CAL_TEST', 'Cal Test')
     ON CONFLICT (code) DO NOTHING`,
  )

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: testEmail, password: 'TestPass1!' })
  adminToken = loginRes.body.accessToken as string

  const clientRes = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ clientType: 'individual', fullName: 'Cal Test Client' })
  const clientId = clientRes.body.id as string

  const matterRes = await request(app)
    .post('/api/matters')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ clientId, matterType: 'CAL_TEST', description: 'Calendar test matter' })
  matterId = matterRes.body.id as string
})

afterAll(async () => {
  await db.query(`DELETE FROM users WHERE email = $1`, [testEmail])
})

describe('GET /api/calendar', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/calendar')
    expect(res.status).toBe(401)
  })

  it('admin can list events', async () => {
    const res = await request(app)
      .get('/api/calendar')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('POST /api/calendar', () => {
  it('creates a single event', async () => {
    const res = await request(app)
      .post('/api/calendar')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventType: 'court_hearing',
        title: 'Test Hearing',
        matterId,
        date: '2026-07-01',
        recurrence: 'none',
      })
    expect(res.status).toBe(201)
    expect(res.body.title).toBe('Test Hearing')
    expect(res.body.matterNumber).toBeDefined()
    expect(typeof res.body.matterNumber).toBe('string')
  })

  it('creates 12 instances for weekly recurrence', async () => {
    const res = await request(app)
      .post('/api/calendar')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventType: 'mention',
        title: 'Weekly Mention',
        matterId,
        date: '2026-07-07',
        recurrence: 'weekly',
      })
    expect(res.status).toBe(201)
    const parentId = res.body.id as string
    const { rows } = await db.query(
      `SELECT COUNT(*) FROM calendar_events WHERE id = $1 OR recurrence_parent_id = $1`,
      [parentId],
    )
    const r = rows[0]
    expect(r).toBeDefined()
    expect(Number(r!['count'])).toBe(12)
  })

  it('creates 12 instances for monthly recurrence', async () => {
    const res = await request(app)
      .post('/api/calendar')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventType: 'filing_deadline',
        title: 'Monthly Filing',
        matterId,
        date: '2026-07-01',
        recurrence: 'monthly',
      })
    expect(res.status).toBe(201)
    const parentId = res.body.id as string
    const { rows } = await db.query(
      `SELECT COUNT(*) FROM calendar_events WHERE id = $1 OR recurrence_parent_id = $1`,
      [parentId],
    )
    const r = rows[0]
    expect(r).toBeDefined()
    expect(Number(r!['count'])).toBe(12)
  })

  it('returns 400 for invalid event type', async () => {
    const res = await request(app)
      .post('/api/calendar')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventType: 'invalid_type', title: 'X', matterId, date: '2026-07-01' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid date format', async () => {
    const res = await request(app)
      .post('/api/calendar')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventType: 'mention', title: 'X', matterId, date: '01-07-2026' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/calendar/:id', () => {
  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .get('/api/calendar/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })

  it('returns the event by id', async () => {
    const create = await request(app)
      .post('/api/calendar')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventType: 'client_meeting', title: 'Get By ID', matterId, date: '2026-07-10' })
    const id = create.body.id as string
    const res = await request(app)
      .get(`/api/calendar/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe(id)
    expect(res.body.isResolved).toBe(false)
  })
})

describe('PATCH /api/calendar/:id/resolve', () => {
  it('marks event resolved and sets acknowledgedAt', async () => {
    const create = await request(app)
      .post('/api/calendar')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventType: 'mention', title: 'To Resolve', matterId, date: '2026-07-01' })
    const id = create.body.id as string
    const res = await request(app)
      .patch(`/api/calendar/${id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.isResolved).toBe(true)
    expect(res.body.acknowledgedAt).not.toBeNull()
  })
})

describe('PUT /api/calendar/:id', () => {
  it('updates title and date', async () => {
    const create = await request(app)
      .post('/api/calendar')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventType: 'mention', title: 'Original', matterId, date: '2026-07-01' })
    const id = create.body.id as string
    const res = await request(app)
      .put(`/api/calendar/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Title', date: '2026-07-15' })
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Updated Title')
    expect(res.body.date).toBe('2026-07-15')
  })

  it('returns 400 when updating a resolved event', async () => {
    const create = await request(app)
      .post('/api/calendar')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventType: 'mention', title: 'Will Resolve', matterId, date: '2026-07-01' })
    const id = create.body.id as string
    await request(app).patch(`/api/calendar/${id}/resolve`).set('Authorization', `Bearer ${adminToken}`)
    const res = await request(app)
      .put(`/api/calendar/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Should Fail' })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/calendar/:id', () => {
  it('deletes an event', async () => {
    const create = await request(app)
      .post('/api/calendar')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventType: 'mention', title: 'To Delete', matterId, date: '2026-07-01' })
    const id = create.body.id as string
    const res = await request(app)
      .delete(`/api/calendar/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(204)
    const check = await request(app)
      .get(`/api/calendar/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(check.status).toBe(404)
  })
})
