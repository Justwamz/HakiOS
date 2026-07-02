import { Router } from 'express'
import { z } from 'zod'
import { emailSchema, passwordSchema } from '@hakios/utils'
import * as authService from '../services/auth.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { createError } from '../middleware/errorHandler.js'
import { friendlyZodMessage } from '../lib/friendlyError.js'

export const authRouter = Router()

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw createError(friendlyZodMessage(result.error), 400, 'VALIDATION_ERROR')
  }
  return result.data
}

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = validate(
      z.object({ email: emailSchema, password: z.string().min(1) }),
      req.body,
    )
    const { tokens, user } = await authService.login(email, password)
    res.json({ ...tokens, user })
  } catch (err) {
    next(err)
  }
})

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = validate(
      z.object({ refreshToken: z.string().min(1) }),
      req.body,
    )
    const tokens = await authService.refresh(refreshToken)
    res.json(tokens)
  } catch (err) {
    next(err)
  }
})

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const { refreshToken } = validate(
      z.object({ refreshToken: z.string().min(1) }),
      req.body,
    )
    await authService.logout(req.user!.id, refreshToken)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

authRouter.post('/reset-password/request', async (req, res, next) => {
  try {
    const { email } = validate(z.object({ email: emailSchema }), req.body)
    await authService.requestPasswordReset(email)
    // Always 200 to prevent user enumeration
    res.json({ message: 'If that email exists, a reset link has been sent.' })
  } catch (err) {
    next(err)
  }
})

authRouter.post('/reset-password/confirm', async (req, res, next) => {
  try {
    const { token, password } = validate(
      z.object({ token: z.string().min(1), password: passwordSchema }),
      req.body,
    )
    await authService.confirmPasswordReset(token, password)
    res.json({ message: 'Password reset successful. Please log in.' })
  } catch (err) {
    next(err)
  }
})

authRouter.post('/invite/accept', async (req, res, next) => {
  try {
    const { token, password } = validate(
      z.object({ token: z.string().min(1), password: passwordSchema }),
      req.body,
    )
    const { tokens, user } = await authService.acceptInvite(token, password)
    res.json({ ...tokens, user })
  } catch (err) {
    next(err)
  }
})
