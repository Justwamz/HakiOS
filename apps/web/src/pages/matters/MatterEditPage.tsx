import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import type { Matter, MatterStatus } from '@hakios/types'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'

interface TypeCode { code: string; label: string }
interface AssignableUser { id: string; firstName: string; lastName: string; role: string }

const MATTER_STATUSES: { value: MatterStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'adjourned', label: 'Adjourned' },
  { value: 'on_appeal', label: 'On Appeal' },
  { value: 'settled', label: 'Settled' },
]

const schema = z.object({
  description: z.string().min(1, 'Description is required'),
  status: z.enum(['active', 'pending', 'adjourned', 'on_appeal', 'settled', 'closed']),
  leadAdvocateId: z.string().uuid().optional().or(z.literal('')),
  supervisingPartnerId: z.string().uuid().optional().or(z.literal('')),
  clerkIds: z.array(z.string().uuid()).optional(),
  opposingParty: z.string().optional(),
  opposingAdvocate: z.string().optional(),
  courtName: z.string().optional(),
  courtStation: z.string().optional(),
  courtDivision: z.string().optional(),
  courtFileNumber: z.string().optional(),
  judge: z.string().optional(),
  nextAction: z.string().optional(),
  nextActionDue: z.string().optional(),
})

type Form = z.infer<typeof schema>

const INPUT_CLASS = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const LABEL_CLASS = 'block text-sm font-medium text-text-primary mb-1'

export function MatterEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<AssignableUser[]>([])
  const [typeCodes, setTypeCodes] = useState<TypeCode[]>([])
  const [matterType, setMatterType] = useState<string>('')

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { clerkIds: [], status: 'active' },
  })

  useEffect(() => {
    if (!id) return
    Promise.all([
      api<Matter>(`/matters/${id}`),
      api<AssignableUser[]>('/users/assignable'),
      api<TypeCode[]>('/matters/types'),
    ]).then(([matter, usersRes, typesRes]) => {
      setUsers(usersRes)
      setTypeCodes(typesRes)
      setMatterType(matter.matterType)
      reset({
        description: matter.description,
        status: matter.status,
        leadAdvocateId: matter.leadAdvocateId ?? '',
        supervisingPartnerId: matter.supervisingPartnerId ?? '',
        clerkIds: matter.clerkIds,
        opposingParty: matter.opposingParty ?? '',
        opposingAdvocate: matter.opposingAdvocate ?? '',
        courtName: matter.courtName ?? '',
        courtStation: matter.courtStation ?? '',
        courtDivision: matter.courtDivision ?? '',
        courtFileNumber: matter.courtFileNumber ?? '',
        judge: matter.judge ?? '',
        nextAction: matter.nextAction ?? '',
        nextActionDue: matter.nextActionDue ?? '',
      })
      setLoading(false)
    }).catch((err: Error) => {
      setServerError(err.message)
      setLoading(false)
    })
  }, [id, reset])

  const advocates = users.filter((u) => u.role === 'associate' || u.role === 'partner' || u.role === 'admin')
  const partners = users.filter((u) => u.role === 'partner' || u.role === 'admin')
  const clerks = users.filter((u) => u.role === 'clerk')

  async function onSubmit(data: Form) {
    setServerError(null)
    try {
      const payload: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(data)) {
        if (v !== '' && v !== undefined && !(Array.isArray(v) && v.length === 0)) {
          payload[k] = v
        }
      }
      await api<Matter>(`/matters/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
      navigate(`/matters/${id}`)
    } catch (err) {
      setServerError((err as Error).message || 'Failed to save changes.')
    }
  }

  if (loading) return <div className="p-8 text-text-muted text-sm">Loading…</div>

  const typeLabel = typeCodes.find((t) => t.code === matterType)?.label ?? matterType

  return (
    <div>
      <PageHeader title={`Edit Matter — ${typeLabel}`} />
      <div className="p-8 max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className={LABEL_CLASS}>Description *</label>
            <textarea {...register('description')} rows={3} className={INPUT_CLASS} />
            {errors.description && <p className="mt-1 text-xs text-status-overdue">{errors.description.message}</p>}
          </div>

          <div>
            <label className={LABEL_CLASS}>Status</label>
            <select {...register('status')} className={INPUT_CLASS}>
              {MATTER_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>Lead Advocate</label>
              <select {...register('leadAdvocateId')} className={INPUT_CLASS}>
                <option value="">None</option>
                {advocates.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Supervising Partner</label>
              <select {...register('supervisingPartnerId')} className={INPUT_CLASS}>
                <option value="">None</option>
                {partners.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
          </div>

          {clerks.length > 0 && (
            <div>
              <p className={LABEL_CLASS}>Clerks</p>
              <div className="space-y-1.5">
                <Controller
                  control={control}
                  name="clerkIds"
                  render={({ field }) => (
                    <>
                      {clerks.map((u) => (
                        <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            value={u.id}
                            checked={(field.value ?? []).includes(u.id)}
                            onChange={(e) => {
                              const current = field.value ?? []
                              field.onChange(
                                e.target.checked
                                  ? [...current, u.id]
                                  : current.filter((x) => x !== u.id),
                              )
                            }}
                            className="accent-primary"
                          />
                          <span className="text-sm">{u.firstName} {u.lastName}</span>
                        </label>
                      ))}
                    </>
                  )}
                />
              </div>
            </div>
          )}

          <div className="border-t border-border pt-5">
            <p className="text-sm font-medium text-text-secondary mb-4">Court details (optional)</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLASS}>Opposing party</label>
                <input {...register('opposingParty')} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>Opposing advocate</label>
                <input {...register('opposingAdvocate')} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>Court name</label>
                <input {...register('courtName')} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>Court station</label>
                <input {...register('courtStation')} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>Division</label>
                <input {...register('courtDivision')} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>Court file no.</label>
                <input {...register('courtFileNumber')} className={INPUT_CLASS} />
              </div>
              <div className="col-span-2">
                <label className={LABEL_CLASS}>Judge</label>
                <input {...register('judge')} className={INPUT_CLASS} />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <p className="text-sm font-medium text-text-secondary mb-4">Next action</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={LABEL_CLASS}>Action description</label>
                <input {...register('nextAction')} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>Due date</label>
                <input type="date" {...register('nextActionDue')} className={INPUT_CLASS} />
              </div>
            </div>
          </div>

          {serverError && <p className="text-sm text-status-overdue">{serverError}</p>}

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
              onClick={() => navigate(`/matters/${id}`)}
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
