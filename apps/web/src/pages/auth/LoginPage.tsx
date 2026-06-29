import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { emailSchema } from '@hakios/utils'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import type { AuthTokens, User } from '@hakios/types'

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

interface LoginResponse extends AuthTokens {
  user: User
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setAuth } = useAuthStore()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'

  async function onSubmit(data: LoginForm) {
    setServerError(null)
    try {
      const res = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      setAuth(res.user, res.accessToken, res.refreshToken)
      navigate(from, { replace: true })
    } catch (err) {
      setServerError((err as Error).message || 'Sign in failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-sm border border-border p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-primary">HakiOS</h1>
          <p className="text-text-secondary text-sm mt-1">Practice Management</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-1">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register('email')}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <p id="email-error" className="mt-1 text-xs text-status-overdue">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
              aria-describedby={errors.password ? 'password-error' : undefined}
            />
            {errors.password && (
              <p id="password-error" className="mt-1 text-xs text-status-overdue">
                {errors.password.message}
              </p>
            )}
          </div>

          {serverError && (
            <p role="alert" className="text-sm text-status-overdue text-center">
              {serverError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary hover:bg-primary-light text-white font-medium py-2.5 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed text-sm"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="text-center">
            <a
              href="/auth/reset-password/request"
              className="text-xs text-text-muted hover:text-text-secondary underline"
            >
              Forgot password?
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}
