import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { CalendarEvent, EventType } from '@hakios/types'
import { hasPermission } from '@hakios/types'
import { useAuthStore } from '../../store/auth'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { EventTypeBadge } from '../../components/EventTypeBadge'

const EVENT_TYPES: EventType[] = [
  'court_hearing',
  'filing_deadline',
  'submission_deadline',
  'mention',
  'client_meeting',
  'internal_review',
]

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  court_hearing: 'Court Hearing',
  filing_deadline: 'Filing Deadline',
  submission_deadline: 'Submission Deadline',
  mention: 'Mention',
  client_meeting: 'Client Meeting',
  internal_review: 'Internal Review',
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function in30DaysStr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const INPUT_CLASS =
  'border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

export function CalendarPage() {
  const user = useAuthStore((s) => s.user)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(todayStr)
  const [to, setTo] = useState(in30DaysStr)
  const [eventType, setEventType] = useState<EventType | ''>('')
  const [includeResolved, setIncludeResolved] = useState(false)

  const canRead =
    !!user &&
    (hasPermission(user.role, 'calendar:read_all') ||
      hasPermission(user.role, 'calendar:read_assigned'))

  useEffect(() => {
    if (!canRead) return

    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (eventType) params.set('eventType', eventType)
    if (includeResolved) params.set('includeResolved', 'true')

    setLoading(true)
    api<CalendarEvent[]>(`/calendar?${params.toString()}`)
      .then((data) => {
        setEvents(data)
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(err.message)
        setLoading(false)
      })
  }, [canRead, from, to, eventType, includeResolved])

  // Permission guard — AFTER all hook declarations
  if (!canRead) {
    return <Navigate to="/" replace />
  }

  // Group events by date
  const grouped = events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
    const existing = acc[event.date] ?? []
    acc[event.date] = existing
    existing.push(event)
    return acc
  }, {})
  const sortedDates = Object.keys(grouped).sort()

  const canCreate = !!user && hasPermission(user.role, 'calendar:create')
  const today = todayStr()

  return (
    <div>
      <PageHeader
        title="Calendar"
        action={
          canCreate ? (
            <Link
              to="/calendar/new"
              className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              New Event
            </Link>
          ) : undefined
        }
      />

      <div className="p-8">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-text-secondary">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-text-secondary">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventType | '')}
            className={INPUT_CLASS}
          >
            <option value="">All event types</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={includeResolved}
              onChange={(e) => setIncludeResolved(e.target.checked)}
            />
            Show resolved
          </label>
        </div>

        {loading && <p className="text-text-muted text-sm">Loading…</p>}
        {error && <p className="text-status-overdue text-sm">{error}</p>}

        {!loading && !error && sortedDates.length === 0 && (
          <p className="text-text-muted text-sm">No events in this date range.</p>
        )}

        <div className="space-y-8">
          {sortedDates.map((date) => {
            const dayEvents = grouped[date] ?? []
            const hasUnresolved = dayEvents.some(e => !e.isResolved)
            const isOverdue = date < today && hasUnresolved
            return (
              <section key={date}>
                <h2
                  className={`text-sm font-semibold mb-3 ${
                    isOverdue ? 'text-status-overdue' : 'text-text-secondary'
                  }`}
                >
                  {formatDate(date)}
                  {isOverdue && (
                    <span className="ml-2 text-xs font-normal">— overdue</span>
                  )}
                </h2>
                <div className="space-y-2">
                  {dayEvents.map((event) => (
                    <Link
                      key={event.id}
                      to={`/calendar/${event.id}`}
                      className="block border border-border rounded-lg p-4 hover:bg-background transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <EventTypeBadge type={event.eventType} />
                            {event.isResolved && (
                              <span className="text-xs text-text-muted">Resolved</span>
                            )}
                          </div>
                          <p className="font-medium text-text-primary truncate">
                            {event.title}
                          </p>
                          <p className="text-sm text-text-secondary truncate">
                            {event.matterNumber}
                          </p>
                        </div>
                        {event.time && (
                          <span className="text-sm text-text-secondary whitespace-nowrap">
                            {event.time}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
