import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { friendlyZodMessage } from '../lib/friendlyError.js'

describe('friendlyZodMessage', () => {
  it('gives a plain-English message for an invalid email', () => {
    const result = z.object({ email: z.string().email() }).safeParse({ email: 'not-an-email' })
    if (result.success) throw new Error('expected failure')
    expect(friendlyZodMessage(result.error)).toBe('Please enter a valid email address.')
  })

  it('gives a plain-English message for a missing required field', () => {
    const result = z.object({ firstName: z.string().min(1) }).safeParse({ firstName: '' })
    if (result.success) throw new Error('expected failure')
    expect(friendlyZodMessage(result.error)).toBe('Please fill in the first name.')
  })

  it('falls back to a generic message for an unmapped field', () => {
    const result = z.object({ somethingObscure: z.string().min(1) }).safeParse({ somethingObscure: '' })
    if (result.success) throw new Error('expected failure')
    expect(friendlyZodMessage(result.error)).toBe('Please fill in the somethingObscure.')
  })
})
