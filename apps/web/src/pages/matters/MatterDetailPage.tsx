import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Matter } from '@hakios/types'
import { hasPermission } from '@hakios/types'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm text-text-primary mt-0.5">{value ?? '—'}</dd>
    </div>
  )
}

export function MatterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const [matter, setMatter] = useState<Matter | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (!id) return
    api<Matter>(`/matters/${id}`)
      .then(setMatter)
      .catch((err: Error) => setError(err.message))
  }, [id])

  async function handleClose() {
    if (!id || !window.confirm('Close this matter?')) return
    setClosing(true)
    try {
      const updated = await api<Matter>(`/matters/${id}/close`, { method: 'POST', body: JSON.stringify({}) })
      setMatter(updated)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setClosing(false)
    }
  }

  const canClose = user ? hasPermission(user.role, 'matters:close') : false

  if (error) return <div className="p-8 text-status-overdue text-sm">{error}</div>
  if (!matter) return <div className="p-8 text-text-muted text-sm">Loading…</div>

  return (
    <div>
      <PageHeader
        title={matter.matterNumber}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={matter.status} />
            {canClose && matter.status !== 'closed' && (
              <button
                onClick={handleClose}
                disabled={closing}
                className="border border-status-conflict-border text-status-overdue hover:bg-status-conflict-bg text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {closing ? 'Closing…' : 'Close matter'}
              </button>
            )}
          </div>
        }
      />
      <div className="p-8 max-w-3xl space-y-8">
        <section>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Overview</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="col-span-2">
              <dt className="text-xs text-text-muted">Description</dt>
              <dd className="text-sm text-text-primary mt-0.5">{matter.description}</dd>
            </div>
            <Row label="Matter type" value={matter.matterType} />
            <Row label="Opened" value={matter.dateOpened} />
            {matter.dateClosed && <Row label="Closed" value={matter.dateClosed} />}
          </dl>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Assignments</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
            <Row label="Lead Advocate" value={matter.leadAdvocateName} />
            <Row label="Supervising Partner" value={matter.supervisingPartnerName} />
            <div>
              <dt className="text-xs text-text-muted">Clerks</dt>
              <dd className="text-sm text-text-primary mt-0.5">
                {matter.clerkNames.length ? matter.clerkNames.join(', ') : '—'}
              </dd>
            </div>
          </dl>
        </section>

        {(matter.opposingParty || matter.courtName) && (
          <section>
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Court Details</h2>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
              <Row label="Opposing Party" value={matter.opposingParty} />
              <Row label="Opposing Advocate" value={matter.opposingAdvocate} />
              <Row label="Court Name" value={matter.courtName} />
              <Row label="Court Station" value={matter.courtStation} />
              <Row label="Division" value={matter.courtDivision} />
              <Row label="Court File No." value={matter.courtFileNumber} />
              <Row label="Judge" value={matter.judge} />
            </dl>
          </section>
        )}

        {(matter.nextAction || matter.nextActionDue) && (
          <section>
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Next Action</h2>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div className="col-span-2">
                <Row label="Action" value={matter.nextAction} />
              </div>
              <Row label="Due date" value={matter.nextActionDue} />
            </dl>
          </section>
        )}

        <div>
          <Link
            to={`/clients/${matter.clientId}`}
            className="text-sm text-primary hover:underline"
          >
            ← View client record
          </Link>
        </div>
      </div>
    </div>
  )
}
