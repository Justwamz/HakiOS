import type { Request, Response, NextFunction } from 'express'
import { hasPermission } from '@hakios/types'
import type { Permission } from '@hakios/types'
import { createError } from './errorHandler.js'

export function requireRole(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(createError('Authentication required', 401, 'UNAUTHENTICATED'))
    }
    const allowed = permissions.every((p) => hasPermission(req.user!.role, p))
    if (!allowed) {
      return next(createError('Insufficient permissions', 403, 'FORBIDDEN'))
    }
    next()
  }
}
