export type Role = 'admin' | 'partner' | 'associate' | 'clerk'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: Role
  isActive: boolean
  createdAt: string   // ISO 8601 UTC
  updatedAt: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface JwtPayload {
  sub: string   // user id
  role: Role
  iat?: number
  exp?: number
}
