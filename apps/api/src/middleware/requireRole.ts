import type { Request, Response, NextFunction } from 'express'
import { hasPermission } from '@hakios/types'
import type { Permission } from '@hakios/types'
import { createError } from './errorHandler.js'

export function requireRole(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(createError('Please sign in to continue.', 401, 'UNAUTHENTICATED'))
    }
    const allowed = permissions.every((p) => hasPermission(req.user!.role, p))
    if (!allowed) {
      return next(createError('You don\'t have permission to do this. Please contact your administrator.', 403, 'FORBIDDEN'))
    }
    next()
  }
}
