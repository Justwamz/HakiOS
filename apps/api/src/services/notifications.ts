import { db } from '../db/client.js'
import webPush from 'web-push'
import type { Notification } from '@hakios/types'

function toNotification(row: Record<string, unknown>): Notification {
  return {
    id: row['id'] as string,
    userId: row['user_id'] as string,
    type: row['type'] as Notification['type'],
    title: row['title'] as string,
    body: row['body'] as string,
    matterId: (row['matter_id'] as string | null) ?? null,
    eventId: (row['event_id'] as string | null) ?? null,
    isRead: row['is_read'] as boolean,
    readAt: row['read_at'] ? (row['read_at'] as Date).toISOString() : null,
    createdAt: (row['created_at'] as Date).toISOString(),
  }
}

async function sendPushToUser(userId: string, title: string, body: string): Promise<void> {
  const { rows } = await db.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId],
  )
  for (const sub of rows) {
    webPush
      .sendNotification(
        {
          endpoint: sub['endpoint'] as string,
          keys: {
            p256dh: sub['p256dh'] as string,
            auth: sub['auth'] as string,
          },
        },
        JSON.stringify({ title, body }),
      )
      .catch(async (err: unknown) => {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 410 || status === 404) {
          await db.query('DELETE FROM push_subscriptions WHERE id = $1', [sub['id']]).catch(() => {})
        }
      })
  }
}

export interface CreateNotificationInput {
  userId: string
  type: 'reminder' | 'escalation' | 'overdue'
  title: string
  body: string
  matterId?: string | null
  eventId?: string | null
}

export async function createNotification(input: CreateNotificationInput): Promise<Notification> {
  const { rows } = await db.query<Record<string, unknown>>(
    `INSERT INTO notifications (user_id, type, title, body, matter_id, event_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.userId,
      input.type,
      input.title,
      input.body,
      input.matterId ?? null,
      input.eventId ?? null,
    ],
  )
  const row = rows[0]
  if (!row) throw new Error('Insert failed')
  sendPushToUser(input.userId, input.title, input.body).catch(() => {})
  return toNotification(row)
}

export async function listNotifications(userId: string): Promise<Notification[]> {
  const { rows } = await db.query(
    `SELECT * FROM notifications
     WHERE user_id = $1
     ORDER BY is_read ASC, created_at DESC
     LIMIT 50`,
    [userId],
  )
  return rows.map(toNotification)
}

export async function unreadCount(userId: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false`,
    [userId],
  )
  const row = rows[0]
  return (row?.['count'] as number) ?? 0
}

export async function markRead(id: string, userId: string): Promise<Notification | null> {
  const { rows } = await db.query<Record<string, unknown>>(
    `UPDATE notifications
     SET is_read = true, read_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [id, userId],
  )
  const row = rows[0]
  if (!row) return null
  return toNotification(row)
}

export async function markAllRead(userId: string): Promise<void> {
  await db.query(
    `UPDATE notifications SET is_read = true, read_at = now()
     WHERE user_id = $1 AND is_read = false`,
    [userId],
  )
}
