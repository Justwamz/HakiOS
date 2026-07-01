import { useState, useEffect } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { CalendarEvent, EventType, User } from '@hakios/types'
import { hasPermission } from '@hakios/types'
import { useAuthStore } from '../../store/auth'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'

const schema = z.object({
  eventType: z.enum([
    'court_hearing',
    'filing_deadline',
    'submission_deadline',
    'mention',
    'client_meeting',
    'internal_review',
  ]),
  title: z.string().min(1, 'Title is required').max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date is required'),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
  supervisingPartnerId: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
  assigneeIds: z.array(z.string().uuid()).default([]),
})

type Form = z.infer<typeof schema>

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  court_hearing: 'Court Hearing',
  filing_deadline: 'Filing Deadline',
  submission_deadline: 'Submission Deadline',
  mention: 'Mention',
  client_meeting: 'Client Meeting',
  internal_review: 'Internal Review',
}

const INPUT_CLASS =
  'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const LABEL_CLASS = 'block text-sm font-medium text-text-primary mb-1'
const ERROR_CLASS = 'mt-1 text-xs text-status-overdue'

export function CalendarEventEditPage() {
  const { id } = useParams<{ id: string }>()
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [assignableUsers, setAssignableUsers] = useState<User[]>([])
  const [recurrenceLabel, setRecurrenceLabel] = useState<string>('none')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (!id) return
    Promise.all([
      api<CalendarEvent>(`/calendar/${id}`),
      api<User[]>('/users/assignable'),
    ])
      .then(([event, users]) => {
        if (event.isResolved) {
          navigate(`/calendar/${id}`, { replace: true })
          return
        }
        setAssignableUsers(users)
        setRecurrenceLabel(event.recurrence)
        reset({
          eventType: event.eventType,
          title: event.title,
          date: event.date,
          time: event.time ?? '',
          supervisingPartnerId: event.supervisingPartnerId ?? '',
          notes: event.notes ?? '',
          assigneeIds: event.assigneeIds,
        })
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(err.message)
        setLoading(false)
      })
  }, [id, navigate, reset])

  // Permission guard — AFTER all hook declarations
  if (!user || !hasPermission(user.role, 'calendar:create')) {
    return <Navigate to={`/calendar/${id ?? ''}`} replace />
  }

  async function onSubmit(data: Form) {
    if (!id) return
    setSubmitError(null)
    try {
      const payload = {
        eventType: data.eventType,
        title: data.title,
        date: data.date,
        time: data.time || null,
        supervisingPartnerId: data.supervisingPartnerId || null,
        notes: data.notes || null,
        assigneeIds: data.assigneeIds,
      }
      await api(`/calendar/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      navigate(`/calendar/${id}`)
    } catch (err) {
      setSubmitError((err as Error).message || 'Failed to save changes.')
    }
  }

  if (loading) return <p className="text-text-muted text-sm p-8">Loading…</p>
  if (error) return <p className="text-status-overdue text-sm p-8">{error}</p>

  const partners = assignableUsers.filter(
    (u) => u.role === 'partner' || u.role === 'admin',
  )

  return (
    <div>
      <PageHeader title="Edit Event" />

      <div className="p-8 max-w-2xl">
        {submitError && (
          <p className="text-status-overdue text-sm mb-4">{submitError}</p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Event Type */}
          <div>
            <label className={LABEL_CLASS}>Event type *</label>
            <select {...register('eventType')} className={INPUT_CLASS}>
              {(Object.entries(EVENT_TYPE_LABELS) as [EventType, string][]).map(
                ([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ),
              )}
            </select>
            {errors.eventType && (
              <p className={ERROR_CLASS}>{errors.eventType.message}</p>
            )}
          </div>

          {/* Title */}
          <div>
            <label className={LABEL_CLASS}>Title *</label>
            <input
              {...register('title')}
              className={INPUT_CLASS}
              placeholder="e.g. Mention at Milimani"
            />
            {errors.title && (
              <p className={ERROR_CLASS}>{errors.title.message}</p>
            )}
          </div>

          {/* Date + Time */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className={LABEL_CLASS}>Date *</label>
              <input type="date" {...register('date')} className={INPUT_CLASS} />
              {errors.date && (
                <p className={ERROR_CLASS}>{errors.date.message}</p>
              )}
            </div>
            <div className="w-40">
              <label className={LABEL_CLASS}>Time (optional)</label>
              <input type="time" {...register('time')} className={INPUT_CLASS} />
            </div>
          </div>

          {/* Recurrence — display only, editing not allowed */}
          <div>
            <label className={LABEL_CLASS}>Recurrence</label>
            <input
              type="text"
              readOnly
              value={
                recurrenceLabel === 'none'
                  ? 'None (single event)'
                  : recurrenceLabel === 'weekly'
                    ? 'Weekly (12 occurrences)'
                    : 'Monthly (12 occurrences)'
              }
              className={`${INPUT_CLASS} bg-surface text-text-muted cursor-not-allowed`}
            />
            <p className="mt-1 text-xs text-text-muted">
              Recurrence cannot be changed after creation.
            </p>
          </div>

          {/* Assignees */}
          <div>
            <label className={LABEL_CLASS}>Assignees</label>
            <div className="grid grid-cols-2 gap-2 mt-1 border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
              {assignableUsers.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    value={u.id}
                    {...register('assigneeIds')}
                    className="accent-primary"
                  />
                  {u.firstName} {u.lastName}
                  <span className="text-text-muted text-xs">({u.role})</span>
                </label>
              ))}
              {assignableUsers.length === 0 && (
                <p className="text-text-muted text-sm col-span-2">
                  No assignable users.
                </p>
              )}
            </div>
          </div>

          {/* Supervising Partner */}
          <div>
            <label className={LABEL_CLASS}>
              Supervising partner (optional)
            </label>
            <select
              {...register('supervisingPartnerId')}
              className={INPUT_CLASS}
              disabled={partners.length === 0}
            >
              <option value="">
                {partners.length === 0 ? 'No partners available' : 'None'}
              </option>
              {partners.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className={LABEL_CLASS}>Notes (optional)</label>
            <textarea
              {...register('notes')}
              rows={3}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-6 py-2.5 rounded-lg transition disabled:opacity-60"
            >
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/calendar/${id}`)}
              className="border border-border text-text-secondary text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-background transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
