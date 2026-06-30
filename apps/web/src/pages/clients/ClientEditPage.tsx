import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import type { Client } from '@hakios/types'
import { hasPermission } from '@hakios/types'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { useAuthStore } from '../../store/auth'

const schema = z.object({
  fullName: z.string().min(1, 'Name is required'),
  idNumber: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  postalAddress: z.string().optional(),
  kraPin: z.string().optional(),
  hasConflict: z.boolean().optional(),
  conflictNotes: z.string().optional(),
  internalNotes: z.string().optional(),
})

type Form = z.infer<typeof schema>

const INPUT_CLASS = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const LABEL_CLASS = 'block text-sm font-medium text-text-primary mb-1'

export function ClientEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [serverError, setServerError] = useState<string | null>(null)
  const [clientType, setClientType] = useState<'individual' | 'corporate'>('individual')
  const [loading, setLoading] = useState(true)

  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { hasConflict: false },
  })

  const hasConflict = watch('hasConflict')

  useEffect(() => {
    if (!id) return
    api<Client>(`/clients/${id}`)
      .then((client) => {
        setClientType(client.clientType)
        reset({
          fullName: client.fullName,
          idNumber: client.idNumber ?? '',
          contactPerson: client.contactPerson ?? '',
          phone: client.phone ?? '',
          email: client.email ?? '',
          postalAddress: client.postalAddress ?? '',
          kraPin: client.kraPin ?? '',
          hasConflict: client.hasConflict,
          conflictNotes: client.conflictNotes ?? '',
          internalNotes: client.internalNotes ?? '',
        })
        setLoading(false)
      })
      .catch((err: Error) => {
        setServerError(err.message)
        setLoading(false)
      })
  }, [id, reset])

  if (!user || !hasPermission(user.role, 'clients:edit')) {
    return <Navigate to={`/clients/${id}`} replace />
  }

  async function onSubmit(data: Form) {
    setServerError(null)
    try {
      const payload = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== '' && v !== undefined),
      )
      await api<Client>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
      navigate(`/clients/${id}`)
    } catch (err) {
      setServerError((err as Error).message || 'Failed to save changes.')
    }
  }

  if (loading) return <div className="p-8 text-text-muted text-sm">Loading…</div>

  return (
    <div>
      <PageHeader title="Edit Client" />
      <div className="p-8 max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className={LABEL_CLASS}>
              {clientType === 'corporate' ? 'Company name' : 'Full name'} *
            </label>
            <input {...register('fullName')} className={INPUT_CLASS} />
            {errors.fullName && <p className="mt-1 text-xs text-status-overdue">{errors.fullName.message}</p>}
          </div>

          {clientType === 'individual' && (
            <div>
              <label className={LABEL_CLASS}>ID / Passport number</label>
              <input {...register('idNumber')} className={INPUT_CLASS} />
            </div>
          )}

          {clientType === 'corporate' && (
            <div>
              <label className={LABEL_CLASS}>Contact person</label>
              <input {...register('contactPerson')} className={INPUT_CLASS} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>Phone</label>
              <input {...register('phone')} className={INPUT_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Email</label>
              <input type="email" {...register('email')} className={INPUT_CLASS} />
              {errors.email && <p className="mt-1 text-xs text-status-overdue">{errors.email.message}</p>}
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Postal address</label>
            <input {...register('postalAddress')} className={INPUT_CLASS} />
          </div>

          <div>
            <label className={LABEL_CLASS}>KRA PIN</label>
            <input {...register('kraPin')} className={INPUT_CLASS} />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('hasConflict')} className="accent-primary" />
              <span className="text-sm font-medium text-text-primary">Conflict of interest flagged</span>
            </label>
            {hasConflict && (
              <div className="mt-2">
                <textarea
                  {...register('conflictNotes')}
                  rows={3}
                  placeholder="Describe the conflict…"
                  className={INPUT_CLASS}
                />
              </div>
            )}
          </div>

          <div>
            <label className={LABEL_CLASS}>Internal notes</label>
            <textarea {...register('internalNotes')} rows={3} className={INPUT_CLASS} />
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
              onClick={() => navigate(`/clients/${id}`)}
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
