import { useState, useEffect } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import type { CalendarEvent } from '@hakios/types'
import { hasPermission } from '@hakios/types'
import { useAuthStore } from '../../store/auth'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { EventTypeBadge } from '../../components/EventTypeBadge'

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function CalendarEventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [event, setEvent] = useState<CalendarEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    api<CalendarEvent>(`/calendar/${id}`)
      .then((data) => {
        setEvent(data)
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(err.message)
        setLoading(false)
      })
  }, [id])

  // Permission guard — AFTER all hook declarations
  if (
    !user ||
    (!hasPermission(user.role, 'calendar:read_all') &&
      !hasPermission(user.role, 'calendar:read_assigned'))
  ) {
    return <Navigate to="/" replace />
  }

  async function handleResolve() {
    if (!id) return
    setResolving(true)
    setResolveError(null)
    try {
      const updated = await api<CalendarEvent>(`/calendar/${id}/resolve`, {
        method: 'PATCH',
      })
      setEvent(updated)
    } catch (err) {
      setResolveError((err as Error).message || 'Failed to resolve event.')
    } finally {
      setResolving(false)
    }
  }

  if (loading) return <p className="text-text-muted text-sm p-8">Loading…</p>
  if (error) return <p className="text-status-overdue text-sm p-8">{error}</p>
  if (!event) return null

  const canEdit =
    hasPermission(user.role, 'calendar:create') && !event.isResolved

  return (
    <div>
      <PageHeader
        title={event.title}
        action={
          canEdit ? (
            <Link
              to={`/calendar/${event.id}/edit`}
              className="border border-border text-text-secondary text-sm font-medium px-4 py-2 rounded-lg hover:bg-background transition"
            >
              Edit
            </Link>
          ) : undefined
        }
      />

      <div className="p-8 max-w-2xl space-y-6">
        {/* Status row */}
        <div className="flex items-center gap-3">
          <EventTypeBadge type={event.eventType} />
          {event.isResolved && (
            <span className="text-sm text-text-muted">
              Resolved
              {event.acknowledgedAt
                ? ` ${new Date(event.acknowledgedAt).toLocaleDateString('en-KE')}`
                : ''}
            </span>
          )}
        </div>

        {resolveError && (
          <p className="text-status-overdue text-sm">{resolveError}</p>
        )}

        {/* Details grid */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <dt className="text-xs font-medium text-text-secondary uppercase tracking-wide">
              Date
            </dt>
            <dd className="mt-1 text-text-primary">{formatDate(event.date)}</dd>
          </div>

          {event.time && (
            <div>
              <dt className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Time
              </dt>
              <dd className="mt-1 text-text-primary">{event.time}</dd>
            </div>
          )}

          <div>
            <dt className="text-xs font-medium text-text-secondary uppercase tracking-wide">
              Matter
            </dt>
            <dd className="mt-1">
              <Link
                to={`/matters/${event.matterId}`}
                className="text-primary hover:underline"
              >
                {event.matterNumber}
              </Link>
            </dd>
          </div>

          {event.recurrence !== 'none' && (
            <div>
              <dt className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Recurrence
              </dt>
              <dd className="mt-1 text-text-primary capitalize">
                {event.recurrence}
              </dd>
            </div>
          )}

          {event.supervisingPartnerId && (
            <div>
              <dt className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Supervising Partner
              </dt>
              <dd className="mt-1 text-text-primary font-mono text-sm">
                {event.supervisingPartnerId}
              </dd>
            </div>
          )}

          {event.assigneeIds.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Assignees
              </dt>
              <dd className="mt-1 text-text-primary">
                {event.assigneeIds.length} assigned
              </dd>
            </div>
          )}

          {event.notes && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Notes
              </dt>
              <dd className="mt-1 text-text-primary whitespace-pre-wrap">
                {event.notes}
              </dd>
            </div>
          )}
        </dl>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          {canEdit && (
            <button
              onClick={handleResolve}
              disabled={resolving}
              className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-6 py-2.5 rounded-lg transition disabled:opacity-60"
            >
              {resolving ? 'Resolving…' : 'Mark as resolved'}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/calendar')}
            className="border border-border text-text-secondary text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-background transition"
          >
            Back to Calendar
          </button>
        </div>
      </div>
    </div>
  )
}
