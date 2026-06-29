export type NotificationType = 'reminder' | 'escalation' | 'overdue'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  matterId: string | null
  eventId: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

export interface WebPushSubscription {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  createdAt: string
}
