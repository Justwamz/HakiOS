import { describe, it, expect } from 'vitest'
import { hashPassword, comparePassword } from '../lib/password.js'

describe('hashPassword / comparePassword', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('Secure@1234')
    expect(await comparePassword('Secure@1234', hash)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Secure@1234')
    expect(await comparePassword('WrongPass!1', hash)).toBe(false)
  })

  it('produces a hash that starts with $2b$ (bcrypt)', async () => {
    const hash = await hashPassword('Test@1234')
    expect(hash.startsWith('$2b$')).toBe(true)
  })
})
