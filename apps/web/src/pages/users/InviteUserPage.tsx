import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, Navigate } from 'react-router-dom'
import { useState } from 'react'
import type { User } from '@hakios/types'
import { hasPermission } from '@hakios/types'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { useAuthStore } from '../../store/auth'

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email required'),
  role: z.enum(['partner', 'associate', 'clerk']),
})

type Form = z.infer<typeof schema>

const INPUT_CLASS = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const LABEL_CLASS = 'block text-sm font-medium text-text-primary mb-1'

export function InviteUserPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'associate' },
  })

  // Permission guard — after all hooks
  if (!user || !hasPermission(user.role, 'users:manage')) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(data: Form) {
    setServerError(null)
    try {
      await api<User>('/users', { method: 'POST', body: JSON.stringify(data) })
      setSuccess(true)
    } catch (err) {
      setServerError((err as Error).message || 'Failed to send invite.')
    }
  }

  if (success) {
    return (
      <div>
        <PageHeader title="Invite User" />
        <div className="p-4 md:p-8 max-w-lg">
          <div className="bg-status-active-bg text-status-active-text rounded-lg p-4 text-sm mb-4">
            Invite sent. The user will receive an email with a link to set their password.
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/users')}
              className="border border-border text-text-secondary text-sm font-medium px-4 py-2 rounded-lg hover:bg-background transition"
            >
              Back to users
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Invite User" />
      <div className="p-8 max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>First name *</label>
              <input {...register('firstName')} className={INPUT_CLASS} />
              {errors.firstName && <p className="mt-1 text-xs text-status-overdue">{errors.firstName.message}</p>}
            </div>
            <div>
              <label className={LABEL_CLASS}>Last name *</label>
              <input {...register('lastName')} className={INPUT_CLASS} />
              {errors.lastName && <p className="mt-1 text-xs text-status-overdue">{errors.lastName.message}</p>}
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Email address *</label>
            <input type="email" {...register('email')} className={INPUT_CLASS} />
            {errors.email && <p className="mt-1 text-xs text-status-overdue">{errors.email.message}</p>}
          </div>

          <div>
            <label className={LABEL_CLASS}>Role *</label>
            <select {...register('role')} className={INPUT_CLASS}>
              <option value="partner">Partner</option>
              <option value="associate">Associate</option>
              <option value="clerk">Clerk</option>
            </select>
          </div>

          {serverError && <p className="text-sm text-status-overdue">{serverError}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-6 py-2.5 rounded-lg transition disabled:opacity-60"
            >
              {isSubmitting ? 'Sending…' : 'Send invite'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/users')}
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
