import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'
import { api } from '../../lib/api'
import type { Notification } from '@hakios/types'

const TYPE_LABELS: Record<string, string> = {
  reminder: 'Reminder',
  overdue: 'Overdue',
  escalation: 'Escalation',
}

export function NotificationsPage() {
  const { user } = useAuthStore()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  useEffect(() => {
    api<Notification[]>('/notifications')
      .then(data => { setNotifications(data); setLoading(false) })
      .catch(err => { setError((err as Error).message); setLoading(false) })
  }, [])

  if (!user) return null

  async function handleMarkRead(id: string) {
    try {
      const updated = await api<Notification>(`/notifications/${id}/read`, { method: 'PATCH' })
      setNotifications(prev => prev.map(n => n.id === id ? updated : n))
    } catch {
      // silent — notification already shows as read optimistically if desired
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true)
    try {
      await api('/notifications/read-all', { method: 'PATCH' })
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true, readAt: new Date().toISOString() })))
    } catch {
      // silent
    } finally {
      setMarkingAll(false)
    }
  }

  if (loading) return <div className="p-8 text-text-muted text-sm">Loading notifications…</div>
  if (error) return <div className="p-8 text-status-overdue-text text-sm">{error}</div>

  const unread = notifications.filter(n => !n.isRead)

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Notifications</h1>
        {unread.length > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="text-sm text-primary hover:underline disabled:opacity-50"
          >
            {markingAll ? 'Marking…' : 'Mark all as read'}
          </button>
        )}
      </div>

      {notifications.length === 0 && (
        <p className="text-text-muted text-sm">No notifications yet.</p>
      )}

      <ul className="space-y-2">
        {notifications.map(n => (
          <li
            key={n.id}
            className={`p-4 rounded-lg border ${
              n.isRead ? 'bg-background border-border' : 'bg-primary/5 border-primary/20'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded ${
                      n.type === 'overdue'
                        ? 'bg-status-overdue-bg text-status-overdue-text'
                        : n.type === 'reminder'
                        ? 'bg-status-pending-bg text-status-pending-text'
                        : 'bg-status-dormant-bg text-status-dormant-text'
                    }`}
                  >
                    {TYPE_LABELS[n.type] ?? n.type}
                  </span>
                  {!n.isRead && (
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-hidden="true" />
                  )}
                </div>
                <p className="text-sm font-medium text-text-primary">{n.title}</p>
                <p className="text-sm text-text-muted mt-0.5">{n.body}</p>
                <div className="flex gap-3 mt-1.5 text-xs text-text-muted">
                  {n.eventId && (
                    <Link to={`/calendar/${n.eventId}`} className="text-primary hover:underline">
                      View event
                    </Link>
                  )}
                  {n.matterId && (
                    <Link to={`/matters/${n.matterId}`} className="text-primary hover:underline">
                      View matter
                    </Link>
                  )}
                  <span>
                    {new Date(n.createdAt).toLocaleDateString('en-KE', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
              {!n.isRead && (
                <button
                  onClick={() => handleMarkRead(n.id)}
                  className="text-xs text-text-muted hover:text-text-primary shrink-0"
                >
                  Mark read
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
