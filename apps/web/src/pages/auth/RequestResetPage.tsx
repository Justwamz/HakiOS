import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { emailSchema } from '@hakios/utils'
import { api } from '../../lib/api'

const schema = z.object({ email: emailSchema })
type Form = z.infer<typeof schema>

export function RequestResetPage() {
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  async function onSubmit(data: Form) {
    setServerError(null)
    try {
      await api('/auth/reset-password/request', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      setDone(true)
    } catch (err) {
      setServerError((err as Error).message || 'Something went wrong. Please try again.')
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-surface rounded-xl shadow-sm border border-border p-8 text-center">
          <h1 className="text-xl font-semibold text-primary mb-2">Check your email</h1>
          <p className="text-text-secondary text-sm">
            If that address is registered, a password reset link has been sent.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-sm border border-border p-8">
        <h1 className="text-xl font-semibold text-primary mb-2 text-center">Reset password</h1>
        <p className="text-text-secondary text-sm text-center mb-6">
          Enter your email address and we'll send you a reset link.
        </p>
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
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-status-overdue">{errors.email.message}</p>
            )}
          </div>
          {serverError && (
            <p role="alert" className="text-sm text-status-overdue text-center">{serverError}</p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary hover:bg-primary-light text-white font-medium py-2.5 rounded-lg transition disabled:opacity-60 text-sm"
          >
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </button>
          <div className="text-center">
            <a href="/auth/login" className="text-xs text-text-muted hover:text-text-secondary underline">
              Back to sign in
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}
