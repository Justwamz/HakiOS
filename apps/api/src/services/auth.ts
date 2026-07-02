import crypto from 'node:crypto'
import { db } from '../db/client.js'
import { hashPassword, comparePassword } from '../lib/password.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js'
import { sendInviteEmail, sendResetEmail } from '../lib/email.js'
import { createError } from '../middleware/errorHandler.js'
import type { AuthTokens, Role, User } from '@hakios/types'

function toUser(row: Record<string, unknown>): User {
  return {
    id: row['id'] as string,
    email: row['email'] as string,
    firstName: row['first_name'] as string,
    lastName: row['last_name'] as string,
    role: row['role'] as Role,
    isActive: row['is_active'] as boolean,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  }
}

async function storeRefreshToken(userId: string, token: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hash, expiresAt],
  )
}

export async function login(
  email: string,
  password: string,
): Promise<{ tokens: AuthTokens; user: User }> {
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [
    email.toLowerCase(),
  ])
  const row = rows[0] as Record<string, unknown> | undefined

  if (!row || !row['password_hash']) {
    throw createError('Invalid email or password', 401, 'INVALID_CREDENTIALS')
  }

  const valid = await comparePassword(password, row['password_hash'] as string)
  if (!valid) throw createError('Invalid email or password', 401, 'INVALID_CREDENTIALS')

  const user = toUser(row)
  const accessToken = signAccessToken(user.id, user.role)
  const refreshToken = signRefreshToken(user.id)
  await storeRefreshToken(user.id, refreshToken)

  return { tokens: { accessToken, refreshToken }, user }
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  let payload: { sub: string }
  try {
    payload = verifyRefreshToken(refreshToken)
  } catch {
    throw createError('Your session has expired. Please sign in again.', 401, 'INVALID_REFRESH_TOKEN')
  }

  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex')
  const { rows } = await db.query(
    'SELECT id FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2 AND expires_at > now()',
    [payload.sub, hash],
  )
  if (rows.length === 0) throw createError('Your session has expired. Please sign in again.', 401, 'INVALID_REFRESH_TOKEN')

  const { rows: userRows } = await db.query(
    'SELECT role FROM users WHERE id = $1 AND is_active = true',
    [payload.sub],
  )
  const userRow = userRows[0] as { role: Role } | undefined
  if (!userRow) throw createError('Your session has expired. Please sign in again.', 401, 'INVALID_REFRESH_TOKEN')

  const newAccessToken = signAccessToken(payload.sub, userRow.role)
  const newRefreshToken = signRefreshToken(payload.sub)

  const rotateClient = await db.connect()
  try {
    await rotateClient.query('BEGIN')
    await rotateClient.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hash])
    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await rotateClient.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [payload.sub, newHash, expiresAt],
    )
    await rotateClient.query('COMMIT')
  } catch (err) {
    await rotateClient.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    rotateClient.release()
  }

  return { accessToken: newAccessToken, refreshToken: newRefreshToken }
}

export async function logout(userId: string, refreshToken: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex')
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2', [
    userId,
    hash,
  ])
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { rows } = await db.query(
    'SELECT id, first_name, email FROM users WHERE email = $1 AND is_active = true',
    [email.toLowerCase()],
  )
  const row = rows[0] as Record<string, unknown> | undefined
  // Return silently even if email not found — prevent user enumeration
  if (!row) return

  const token = crypto.randomBytes(32).toString('hex')
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await db.query(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [row['id'], hash, expiresAt],
  )

  const firmName = await getSettingValue('firm_profile', 'firmName', 'Your Firm')
  const resetUrl = `${process.env['APP_URL'] ?? 'http://localhost:5173'}/auth/reset-password?token=${token}`
  await sendResetEmail({
    to: row['email'] as string,
    firstName: row['first_name'] as string,
    firmName,
    resetUrl,
  })
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT pr.id, pr.user_id FROM password_resets pr
       WHERE pr.token_hash = $1 AND pr.expires_at > now() AND pr.used_at IS NULL
       FOR UPDATE`,
      [hash],
    )
    const row = rows[0] as { id: string; user_id: string } | undefined
    if (!row) throw createError('This password reset link has expired or is invalid. Please request a new one.', 400, 'INVALID_RESET_TOKEN')

    const passwordHash = await hashPassword(newPassword)
    await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
      passwordHash,
      row.user_id,
    ])
    await client.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [row.id])
    await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [row.user_id])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function createUser(data: {
  email: string
  firstName: string
  lastName: string
  role: Role
}): Promise<User> {
  const { rows } = await db.query<Record<string, unknown>>(
    `INSERT INTO users (email, first_name, last_name, role)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.email.toLowerCase(), data.firstName, data.lastName, data.role],
  )
  const user = toUser(rows[0]!)

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours
  await db.query(
    'INSERT INTO user_invites (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, tokenHash, expiresAt],
  )

  const firmName = await getSettingValue('firm_profile', 'firmName', 'Your Firm')
  const setupUrl = `${process.env['APP_URL'] ?? 'http://localhost:5173'}/auth/setup-password?token=${token}`
  await sendInviteEmail({
    to: user.email,
    firstName: user.firstName,
    firmName,
    setupUrl,
    expiresInHours: 48,
  })
  return user
}

export async function acceptInvite(
  token: string,
  password: string,
): Promise<{ tokens: AuthTokens; user: User }> {
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  let userId: string | undefined
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    // SELECT FOR UPDATE locks the row — concurrent request must wait, preventing TOCTOU
    const { rows } = await client.query(
      `SELECT ui.id, ui.user_id FROM user_invites ui
       WHERE ui.token_hash = $1 AND ui.expires_at > now() AND ui.accepted_at IS NULL
       FOR UPDATE`,
      [hash],
    )
    const row = rows[0] as { id: string; user_id: string } | undefined
    if (!row) throw createError('This invitation link has expired or is invalid. Please contact your administrator for a new invite.', 400, 'INVALID_INVITE_TOKEN')

    userId = row.user_id
    const passwordHash = await hashPassword(password)
    await client.query(
      'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
      [passwordHash, row.user_id],
    )
    await client.query('UPDATE user_invites SET accepted_at = now() WHERE id = $1', [row.id])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  const { rows: userRows } = await db.query('SELECT * FROM users WHERE id = $1', [userId!])
  const user = toUser(userRows[0] as Record<string, unknown>)
  const accessToken = signAccessToken(user.id, user.role)
  const refreshToken = signRefreshToken(user.id)
  await storeRefreshToken(user.id, refreshToken)

  return { tokens: { accessToken, refreshToken }, user }
}

async function getSettingValue(key: string, field: string, fallback: string): Promise<string> {
  const { rows } = await db.query('SELECT value FROM settings WHERE key = $1', [key])
  const row = rows[0] as { value: Record<string, unknown> } | undefined
  return (row?.value[field] as string | undefined) ?? fallback
}
