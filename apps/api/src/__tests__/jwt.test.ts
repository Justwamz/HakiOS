import { describe, it, expect } from 'vitest'
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../lib/jwt.js'

describe('signAccessToken / verifyAccessToken', () => {
  it('round-trips a token with correct payload', () => {
    const token = signAccessToken('user-123', 'partner')
    const payload = verifyAccessToken(token)
    expect(payload.sub).toBe('user-123')
    expect(payload.role).toBe('partner')
  })

  it('throws on tampered token', () => {
    const token = signAccessToken('user-123', 'admin')
    expect(() => verifyAccessToken(token + 'x')).toThrow()
  })
})

describe('signRefreshToken / verifyRefreshToken', () => {
  it('round-trips a refresh token', () => {
    const token = signRefreshToken('user-456')
    const payload = verifyRefreshToken(token)
    expect(payload.sub).toBe('user-456')
  })
})
