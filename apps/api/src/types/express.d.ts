import type { Role } from '@hakios/types'

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role }
    }
  }
}
