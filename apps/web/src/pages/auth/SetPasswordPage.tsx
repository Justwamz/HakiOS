import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { passwordSchema } from '@hakios/utils'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import type { AuthTokens, User } from '@hakios/types'

const schema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type SetPasswordForm = z.infer<typeof schema>

interface Props {
  mode: 'invite' | 'reset'
}

interface InviteResponse extends AuthTokens {
  user: User
}

export function SetPasswordPage({ mode }: Props) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const token = params.get('token') ?? ''

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordForm>({ resolver: zodResolver(schema) })

  async function onSubmit(data: SetPasswordForm) {
    setServerError(null)
    try {
      if (mode === 'invite') {
        const res = await api<InviteResponse>('/auth/invite/accept', {
          method: 'POST',
          body: JSON.stringify({ token, password: data.password }),
        })
        setAuth(res.user, res.accessToken, res.refreshToken)
        navigate('/', { replace: true })
      } else {
        await api('/auth/reset-password/confirm', {
          method: 'POST',
          body: JSON.stringify({ token, password: data.password }),
        })
        setDone(true)
      }
    } catch (err) {
      setServerError((err as Error).message || 'An error occurred. Please try again.')
    }
  }

  const heading = mode === 'invite' ? 'Set up your account' : 'Set a new password'

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-surface rounded-xl shadow-sm border border-border p-8 text-center">
          <h1 className="text-xl font-semibold text-primary mb-2">Password updated</h1>
          <p className="text-text-secondary text-sm mb-6">
            You can now sign in with your new password.
          </p>
          <a
            href="/auth/login"
            className="inline-block bg-primary text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-primary-light transition"
          >
            Go to sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-sm border border-border p-8">
        <h1 className="text-xl font-semibold text-primary mb-6 text-center">{heading}</h1>
        {!token && (
          <p className="text-status-overdue text-sm text-center mb-4">
            Invalid or missing token. Please use the link from your email.
          </p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-text-primary mb-1"
            >
              New password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register('password')}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-status-overdue">{errors.password.message}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-text-primary mb-1"
            >
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-status-overdue">{errors.confirmPassword.message}</p>
            )}
          </div>
          <p className="text-xs text-text-muted">
            Min 8 characters, one uppercase, one number, one special character.
          </p>
          {serverError && (
            <p role="alert" className="text-sm text-status-overdue text-center">
              {serverError}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !token}
            className="w-full bg-primary hover:bg-primary-light text-white font-medium py-2.5 rounded-lg transition disabled:opacity-60 text-sm"
          >
            {isSubmitting ? 'Saving…' : 'Set password'}
          </button>
        </form>
      </div>
    </div>
  )
}
