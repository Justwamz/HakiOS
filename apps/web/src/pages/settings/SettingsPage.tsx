import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import type { MatterTypeCode } from '@hakios/types'
import { hasPermission } from '@hakios/types'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { useAuthStore } from '../../store/auth'

interface Settings {
  firm: { firmName: string; address: string; phone: string; email: string }
  caseNumber: {
    firmPrefix: string
    includeTypeCode: boolean
    includeYear: boolean
    sequenceDigits: 4 | 5 | 6
    separator: '/' | '-' | '.'
  }
}

const firmSchema = z.object({
  firmName: z.string().max(100),
  address: z.string().max(500),
  phone: z.string().max(30),
  email: z.string().email('Invalid email').or(z.literal('')),
})

const caseSchema = z.object({
  firmPrefix: z.string().min(1).max(6, 'Max 6 characters'),
  includeTypeCode: z.boolean(),
  includeYear: z.boolean(),
  sequenceDigits: z.coerce.number().refine((n) => [4, 5, 6].includes(n), 'Must be 4, 5, or 6'),
  separator: z.enum(['/', '-', '.']),
})

const typeSchema = z.object({
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/, 'Uppercase letters, digits, underscores only'),
  label: z.string().min(1).max(100),
})

type FirmForm = z.infer<typeof firmSchema>
type CaseForm = z.infer<typeof caseSchema>
type TypeForm = z.infer<typeof typeSchema>

const INPUT_CLASS = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'
const LABEL_CLASS = 'block text-sm font-medium text-text-primary mb-1'

export function SettingsPage() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [firmSaved, setFirmSaved] = useState(false)
  const [caseSaved, setCaseSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [matterTypes, setMatterTypes] = useState<MatterTypeCode[]>([])
  const [typeError, setTypeError] = useState<string | null>(null)
  const [togglingCode, setTogglingCode] = useState<string | null>(null)

  const firmForm = useForm<FirmForm>({ resolver: zodResolver(firmSchema) })
  const caseForm = useForm<CaseForm>({ resolver: zodResolver(caseSchema) })
  const typeForm = useForm<TypeForm>({ resolver: zodResolver(typeSchema) })

  useEffect(() => {
    Promise.all([
      api<Settings>('/settings'),
      api<MatterTypeCode[]>('/settings/matter-types'),
    ]).then(([settings, types]) => {
      firmForm.reset(settings.firm)
      caseForm.reset({
        ...settings.caseNumber,
        sequenceDigits: settings.caseNumber.sequenceDigits,
      })
      setMatterTypes(types)
      setLoading(false)
    }).catch((err: Error) => {
      setError(err.message)
      setLoading(false)
    })
  }, [])

  // Permission guard — after all hooks
  if (!user || !hasPermission(user.role, 'settings:manage')) {
    return <Navigate to="/" replace />
  }

  async function onFirmSubmit(data: FirmForm) {
    setFirmSaved(false)
    setSaveError(null)
    try {
      await api('/settings/firm', { method: 'PUT', body: JSON.stringify(data) })
      setFirmSaved(true)
    } catch (err) {
      setSaveError((err as Error).message || 'Failed to save firm profile.')
    }
  }

  async function onCaseSubmit(data: CaseForm) {
    setCaseSaved(false)
    setSaveError(null)
    try {
      await api('/settings/case-number', { method: 'PUT', body: JSON.stringify({
        ...data,
        sequenceDigits: Number(data.sequenceDigits) as 4 | 5 | 6,
      }) })
      setCaseSaved(true)
    } catch (err) {
      setSaveError((err as Error).message || 'Failed to save case number format.')
    }
  }

  async function onTypeSubmit(data: TypeForm) {
    setTypeError(null)
    try {
      const created = await api<MatterTypeCode>('/settings/matter-types', {
        method: 'POST',
        body: JSON.stringify({ code: data.code.toUpperCase(), label: data.label }),
      })
      setMatterTypes((prev) => [...prev, created])
      typeForm.reset()
    } catch (err) {
      setTypeError((err as Error).message || 'Failed to add matter type.')
    }
  }

  async function handleToggleType(type: MatterTypeCode) {
    setTogglingCode(type.code)
    try {
      const updated = await api<MatterTypeCode>(`/settings/matter-types/${type.code}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !type.isActive }),
      })
      setMatterTypes((prev) => prev.map((t) => (t.code === updated.code ? updated : t)))
    } catch (err) {
      setTypeError((err as Error).message)
    } finally {
      setTogglingCode(null)
    }
  }

  if (loading) return <div className="p-8 text-text-muted text-sm">Loading…</div>
  if (error) return <div className="p-8 text-status-overdue text-sm">{error}</div>

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="p-8 max-w-2xl space-y-10">
        {saveError && <p className="text-sm text-status-overdue mb-4">{saveError}</p>}

        {/* Firm Profile */}
        <section>
          <h2 className="text-sm font-semibold text-text-primary mb-4">Firm Profile</h2>
          <form onSubmit={firmForm.handleSubmit(onFirmSubmit)} className="space-y-4">
            <div>
              <label className={LABEL_CLASS}>Firm name</label>
              <input {...firmForm.register('firmName')} className={INPUT_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Address</label>
              <textarea {...firmForm.register('address')} rows={2} className={INPUT_CLASS} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLASS}>Phone</label>
                <input {...firmForm.register('phone')} className={INPUT_CLASS} />
              </div>
              <div>
                <label className={LABEL_CLASS}>Email</label>
                <input type="email" {...firmForm.register('email')} className={INPUT_CLASS} />
                {firmForm.formState.errors.email && (
                  <p className="mt-1 text-xs text-status-overdue">{firmForm.formState.errors.email.message}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={firmForm.formState.isSubmitting}
                className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-5 py-2 rounded-lg transition disabled:opacity-60"
              >
                {firmForm.formState.isSubmitting ? 'Saving…' : 'Save firm profile'}
              </button>
              {firmSaved && <span className="text-sm text-status-active-text">Saved.</span>}
            </div>
          </form>
        </section>

        {/* Case Number Format */}
        <section>
          <h2 className="text-sm font-semibold text-text-primary mb-4">Case Number Format</h2>
          <form onSubmit={caseForm.handleSubmit(onCaseSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLASS}>Firm prefix (max 6 chars)</label>
                <input {...caseForm.register('firmPrefix')} className={INPUT_CLASS} />
                {caseForm.formState.errors.firmPrefix && (
                  <p className="mt-1 text-xs text-status-overdue">{caseForm.formState.errors.firmPrefix.message}</p>
                )}
              </div>
              <div>
                <label className={LABEL_CLASS}>Separator</label>
                <select {...caseForm.register('separator')} className={INPUT_CLASS}>
                  <option value="/">/</option>
                  <option value="-">-</option>
                  <option value=".">.</option>
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Sequence digits</label>
                <select {...caseForm.register('sequenceDigits')} className={INPUT_CLASS}>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                  <option value={6}>6</option>
                </select>
              </div>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" {...caseForm.register('includeTypeCode')} className="accent-primary" />
                Include matter type code
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" {...caseForm.register('includeYear')} className="accent-primary" />
                Include year
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={caseForm.formState.isSubmitting}
                className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-5 py-2 rounded-lg transition disabled:opacity-60"
              >
                {caseForm.formState.isSubmitting ? 'Saving…' : 'Save format'}
              </button>
              {caseSaved && <span className="text-sm text-status-active-text">Saved.</span>}
            </div>
          </form>
        </section>

        {/* Matter Types */}
        <section>
          <h2 className="text-sm font-semibold text-text-primary mb-4">Matter Types</h2>
          {typeError && <p className="text-sm text-status-overdue mb-3">{typeError}</p>}
          <div className="bg-surface rounded-xl border border-border overflow-hidden mb-5">
            <table className="w-full text-sm">
              <thead className="bg-background border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Code</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Label</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {matterTypes.map((t) => (
                  <tr key={t.code} className={t.isActive ? '' : 'opacity-50'}>
                    <td className="px-4 py-2 font-mono text-xs text-text-secondary">{t.code}</td>
                    <td className="px-4 py-2 text-text-primary">{t.label}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.isActive ? 'bg-status-active-bg text-status-active-text' : 'bg-background text-text-muted'}`}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleToggleType(t)}
                        disabled={togglingCode === t.code}
                        className="text-xs text-text-secondary hover:text-text-primary underline disabled:opacity-50 transition"
                      >
                        {togglingCode === t.code ? '…' : t.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form onSubmit={typeForm.handleSubmit(onTypeSubmit)} className="flex gap-3 items-end">
            <div className="w-28">
              <label className={LABEL_CLASS}>Code</label>
              <input {...typeForm.register('code')} placeholder="PROP" className={INPUT_CLASS} />
              {typeForm.formState.errors.code && (
                <p className="mt-1 text-xs text-status-overdue">{typeForm.formState.errors.code.message}</p>
              )}
            </div>
            <div className="flex-1">
              <label className={LABEL_CLASS}>Label</label>
              <input {...typeForm.register('label')} placeholder="Property" className={INPUT_CLASS} />
              {typeForm.formState.errors.label && (
                <p className="mt-1 text-xs text-status-overdue">{typeForm.formState.errors.label.message}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={typeForm.formState.isSubmitting}
              className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-60 whitespace-nowrap"
            >
              {typeForm.formState.isSubmitting ? 'Adding…' : 'Add type'}
            </button>
          </form>
        </section>

      </div>
    </div>
  )
}
