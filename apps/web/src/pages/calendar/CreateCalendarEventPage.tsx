import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { EventType, Matter, User } from '@hakios/types'
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
  matterId: z.string().uuid('Select a matter'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date is required'),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
  supervisingPartnerId: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
  recurrence: z.enum(['none', 'weekly', 'monthly']).default('none'),
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

export function CreateCalendarEventPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [matters, setMatters] = useState<Matter[]>([])
  const [assignableUsers, setAssignableUsers] = useState<User[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { recurrence: 'none', assigneeIds: [] },
  })

  const canCreate = !!user && hasPermission(user.role, 'calendar:create')

  useEffect(() => {
    if (!canCreate) return

    Promise.all([
      api<{ items: Matter[] }>('/matters?limit=200&status=active'),
      api<User[]>('/users/assignable'),
    ])
      .then(([matterData, users]) => {
        setMatters(matterData.items)
        setAssignableUsers(users)
      })
      .catch((err: Error) => setLoadError(err.message))
  }, [canCreate])

  // Permission guard — AFTER all hook declarations
  if (!canCreate) {
    return <Navigate to="/calendar" replace />
  }

  async function onSubmit(data: Form) {
    setSubmitError(null)
    try {
      const payload = {
        eventType: data.eventType,
        title: data.title,
        matterId: data.matterId,
        date: data.date,
        time: data.time || undefined,
        supervisingPartnerId: data.supervisingPartnerId || undefined,
        notes: data.notes || undefined,
        recurrence: data.recurrence,
        assigneeIds: data.assigneeIds,
      }
      await api('/calendar', { method: 'POST', body: JSON.stringify(payload) })
      navigate('/calendar')
    } catch (err) {
      setSubmitError((err as Error).message || 'Failed to create event.')
    }
  }

  const partners = assignableUsers.filter(
    (u) => u.role === 'partner' || u.role === 'admin',
  )

  return (
    <div>
      <PageHeader title="New Calendar Event" />

      <div className="p-8 max-w-2xl">
        {loadError && <p className="text-status-overdue text-sm mb-4">{loadError}</p>}
        {submitError && <p className="text-status-overdue text-sm mb-4">{submitError}</p>}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Event Type */}
          <div>
            <label className={LABEL_CLASS}>Event type *</label>
            <select {...register('eventType')} className={INPUT_CLASS}>
              <option value="">Select type…</option>
              {(Object.entries(EVENT_TYPE_LABELS) as [EventType, string][]).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
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
            {errors.title && <p className={ERROR_CLASS}>{errors.title.message}</p>}
          </div>

          {/* Matter */}
          <div>
            <label className={LABEL_CLASS}>Matter *</label>
            <select {...register('matterId')} className={INPUT_CLASS}>
              <option value="">Select matter…</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.matterNumber} — {m.description}
                </option>
              ))}
            </select>
            {errors.matterId && <p className={ERROR_CLASS}>{errors.matterId.message}</p>}
          </div>

          {/* Date + Time */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className={LABEL_CLASS}>Date *</label>
              <input type="date" {...register('date')} className={INPUT_CLASS} />
              {errors.date && <p className={ERROR_CLASS}>{errors.date.message}</p>}
            </div>
            <div className="w-40">
              <label className={LABEL_CLASS}>Time (optional)</label>
              <input type="time" {...register('time')} className={INPUT_CLASS} />
            </div>
          </div>

          {/* Recurrence */}
          <div>
            <label className={LABEL_CLASS}>Recurrence</label>
            <select {...register('recurrence')} className={INPUT_CLASS}>
              <option value="none">None (single event)</option>
              <option value="weekly">Weekly (12 occurrences)</option>
              <option value="monthly">Monthly (12 occurrences)</option>
            </select>
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
                <p className="text-text-muted text-sm col-span-2">Loading…</p>
              )}
            </div>
          </div>

          {/* Supervising Partner */}
          {partners.length > 0 && (
            <div>
              <label className={LABEL_CLASS}>Supervising partner (optional)</label>
              <select {...register('supervisingPartnerId')} className={INPUT_CLASS}>
                <option value="">None</option>
                {partners.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className={LABEL_CLASS}>Notes (optional)</label>
            <textarea {...register('notes')} rows={3} className={INPUT_CLASS} />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-6 py-2.5 rounded-lg transition disabled:opacity-60"
            >
              {isSubmitting ? 'Creating…' : 'Create event'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/calendar')}
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
