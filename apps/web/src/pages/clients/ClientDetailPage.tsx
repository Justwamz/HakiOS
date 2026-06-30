import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Client } from '@hakios/types'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm text-text-primary mt-0.5">{value ?? '—'}</dd>
    </div>
  )
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    api<Client>(`/clients/${id}`)
      .then(setClient)
      .catch((err: Error) => setError(err.message))
  }, [id])

  if (error) return <div className="p-8 text-status-overdue text-sm">{error}</div>
  if (!client) return <div className="p-8 text-text-muted text-sm">Loading…</div>

  return (
    <div>
      <PageHeader
        title={client.fullName}
        action={<StatusBadge status={client.status} />}
      />
      <div className="p-8 max-w-3xl space-y-8">
        <section>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Identity</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs text-text-muted">Client ID</dt>
              <dd className="font-mono text-sm text-text-primary mt-0.5">{client.clientId}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Type</dt>
              <dd className="text-sm text-text-primary mt-0.5 capitalize">{client.clientType}</dd>
            </div>
            {client.idNumber && <DetailRow label="ID / Passport" value={client.idNumber} />}
            {client.contactPerson && <DetailRow label="Contact Person" value={client.contactPerson} />}
            {client.kraPin && <DetailRow label="KRA PIN" value={client.kraPin} />}
          </dl>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Contact</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
            <DetailRow label="Phone" value={client.phone} />
            <DetailRow label="Email" value={client.email} />
            <div className="col-span-2">
              <DetailRow label="Postal Address" value={client.postalAddress} />
            </div>
          </dl>
        </section>

        {(client.hasConflict || client.internalNotes) && (
          <section>
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Notes</h2>
            {client.hasConflict && (
              <div className="bg-status-conflict-bg border border-status-conflict-border rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-status-conflict-text mb-1">Conflict of Interest</p>
                {client.conflictNotes && (
                  <p className="text-sm text-status-conflict-text">{client.conflictNotes}</p>
                )}
              </div>
            )}
            {client.internalNotes && (
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{client.internalNotes}</p>
            )}
          </section>
        )}

        <div>
          <Link
            to={`/matters?clientId=${client.id}`}
            className="text-sm text-primary hover:underline"
          >
            View matters for this client →
          </Link>
        </div>
      </div>
    </div>
  )
}
