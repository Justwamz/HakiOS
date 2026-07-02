import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../lib/jwt.js'
import { createError } from './errorHandler.js'

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers['authorization']
  if (!header?.startsWith('Bearer ')) {
    return next(createError('Please sign in to continue.', 401, 'UNAUTHENTICATED'))
  }

  const token = header.slice(7)
  try {
    const payload = verifyAccessToken(token)
    req.user = { id: payload.sub, role: payload.role }
    next()
  } catch {
    next(createError('Your session has expired. Please sign in again.', 401, 'INVALID_TOKEN'))
  }
}
