import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { db } from '../db/client.js'
import { signAccessToken } from '../lib/jwt.js'
import { createNotification } from '../services/notifications.js'

const app = createApp()

let userId: string
let otherUserId: string
let token: string
let otherToken: string = ''

beforeAll(async () => {
  const r1 = await db.query(
    `INSERT INTO users (id, email, first_name, last_name, role, password_hash, is_active)
     VALUES (gen_random_uuid(), 'notif-a@hakios.test', 'Notif', 'A', 'associate', 'x', true)
     RETURNING id`,
  )
  const u1 = r1.rows[0]
  if (!u1) throw new Error('Setup failed')
  userId = u1['id'] as string
  token = signAccessToken(userId, 'associate')

  const r2 = await db.query(
    `INSERT INTO users (id, email, first_name, last_name, role, password_hash, is_active)
     VALUES (gen_random_uuid(), 'notif-b@hakios.test', 'Notif', 'B', 'associate', 'x', true)
     RETURNING id`,
  )
  const u2 = r2.rows[0]
  if (!u2) throw new Error('Setup failed')
  otherUserId = u2['id'] as string
  otherToken = signAccessToken(otherUserId, 'associate')
})

afterAll(async () => {
  await db.query('DELETE FROM notifications WHERE user_id IN ($1, $2)', [userId, otherUserId])
  await db.query('DELETE FROM users WHERE id IN ($1, $2)', [userId, otherUserId])
})

describe('GET /api/notifications', () => {
  it('returns empty list for a new user', async () => {
    const res = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns own notifications, unread first', async () => {
    await createNotification({ userId, type: 'reminder', title: 'T1', body: 'B1' })
    const n2 = await createNotification({ userId, type: 'overdue', title: 'T2', body: 'B2' })
    await db.query('UPDATE notifications SET is_read = true, read_at = now() WHERE id = $1', [n2.id])

    const res = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body[0].isRead).toBe(false)
    expect(res.body[1].isRead).toBe(true)
  })
})

describe('GET /api/notifications/count', () => {
  it('returns correct unread count', async () => {
    await db.query('DELETE FROM notifications WHERE user_id = $1', [userId])
    await createNotification({ userId, type: 'reminder', title: 'C1', body: 'B' })
    await createNotification({ userId, type: 'reminder', title: 'C2', body: 'B' })
    const res = await request(app).get('/api/notifications/count').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.count).toBeGreaterThanOrEqual(2)
  })
})

describe('PATCH /api/notifications/:id/read', () => {
  it('marks a notification as read', async () => {
    await db.query('DELETE FROM notifications WHERE user_id = $1', [userId])
    const n = await createNotification({ userId, type: 'reminder', title: 'R', body: 'B' })
    const res = await request(app)
      .patch(`/api/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.isRead).toBe(true)
  })

  it("returns 404 when user tries to read another user's notification", async () => {
    const n = await createNotification({ userId: otherUserId, type: 'reminder', title: 'X', body: 'Y' })
    const res = await request(app)
      .patch(`/api/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/notifications/read-all', () => {
  it('marks all unread notifications as read', async () => {
    await db.query('DELETE FROM notifications WHERE user_id = $1', [userId])
    await createNotification({ userId, type: 'reminder', title: 'A', body: 'B' })
    await createNotification({ userId, type: 'overdue', title: 'C', body: 'D' })

    const res = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(204)

    const countRes = await request(app)
      .get('/api/notifications/count')
      .set('Authorization', `Bearer ${token}`)
    expect(countRes.body.count).toBe(0)
  })
})

