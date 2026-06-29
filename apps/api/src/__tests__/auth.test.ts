import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { db } from '../db/client.js'
import { hashPassword } from '../lib/password.js'

// Prevent actual emails during tests
vi.mock('../lib/email.js', () => ({
  sendInviteEmail: vi.fn(),
  sendResetEmail: vi.fn(),
  sendReminderEmail: vi.fn(),
  sendEscalationEmail: vi.fn(),
}))

const app = createApp()
let testUserId: string

beforeAll(async () => {
  const hash = await hashPassword('Test@1234!')
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ($1, $2, 'Test', 'User', 'associate')
     ON CONFLICT (email) DO UPDATE SET password_hash = $2
     RETURNING id`,
    ['test@hakios.test', hash],
  )
  testUserId = rows[0]!.id
})

afterAll(async () => {
  await db.query('DELETE FROM users WHERE email = $1', ['test@hakios.test'])
  await db.end()
})

describe('POST /auth/login', () => {
  it('returns 200 with tokens on valid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@hakios.test', password: 'Test@1234!' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('accessToken')
    expect(res.body).toHaveProperty('refreshToken')
    expect(res.body).toHaveProperty('user.email', 'test@hakios.test')
  })

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@hakios.test', password: 'WrongPass!1' })
    expect(res.status).toBe(401)
  })

  it('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@hakios.test', password: 'Test@1234!' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when body is missing fields', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'test@hakios.test' })
    expect(res.status).toBe(400)
  })
})

describe('POST /auth/refresh', () => {
  it('returns new tokens with a valid refresh token', async () => {
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'test@hakios.test', password: 'Test@1234!' })
    const { refreshToken } = loginRes.body as { refreshToken: string }

    const res = await request(app).post('/auth/refresh').send({ refreshToken })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('accessToken')
  })

  it('returns 401 with an invalid refresh token', async () => {
    const res = await request(app).post('/auth/refresh').send({ refreshToken: 'garbage' })
    expect(res.status).toBe(401)
  })
})

describe('POST /auth/logout', () => {
  it('invalidates the refresh token', async () => {
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'test@hakios.test', password: 'Test@1234!' })
    const { accessToken, refreshToken } = loginRes.body as {
      accessToken: string
      refreshToken: string
    }

    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(204)

    // Refresh should now fail
    const res = await request(app).post('/auth/refresh').send({ refreshToken })
    expect(res.status).toBe(401)
  })
})
