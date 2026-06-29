import jwt from 'jsonwebtoken'
import type { JwtPayload, Role } from '@hakios/types'

function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`${name} environment variable is required`)
  return val
}

export function signAccessToken(userId: string, role: Role): string {
  return jwt.sign({ sub: userId, role }, requireEnv('JWT_SECRET'), {
    expiresIn: '15m',
  })
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, requireEnv('JWT_REFRESH_SECRET'), {
    expiresIn: '7d',
  })
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, requireEnv('JWT_SECRET')) as JwtPayload
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, requireEnv('JWT_REFRESH_SECRET')) as { sub: string }
}
