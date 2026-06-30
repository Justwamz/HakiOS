import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Client } from '@hakios/types'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'

interface PaginatedClients {
  items: Client[]
  total: number
  page: number
  limit: number
}

export function ClientsListPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<PaginatedClients | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (status) params.set('status', status)
    params.set('page', String(page))
    setError(null)
    api<PaginatedClients>(`/clients?${params.toString()}`)
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [search, status, page])

  const totalPages = data ? Math.ceil(data.total / (data.limit || 20)) : 0

  return (
    <div>
      <PageHeader
        title="Clients"
        action={
          <Link
            to="/clients/new"
            className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            New client
          </Link>
        }
      />
      <div className="p-8">
        <div className="flex gap-3 mb-6">
          <input
            type="search"
            placeholder="Search by name or ID…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-64"
          />
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="dormant">Dormant</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {error && <p className="text-status-overdue text-sm mb-4">{error}</p>}

        {!data ? (
          <p className="text-text-muted text-sm">Loading…</p>
        ) : (
          <>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-background border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Client ID</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-muted">No clients found</td>
                    </tr>
                  ) : (
                    data.items.map((client) => (
                      <tr
                        key={client.id}
                        className="hover:bg-background cursor-pointer"
                        onClick={() => navigate(`/clients/${client.id}`)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-text-secondary">{client.clientId}</td>
                        <td className="px-4 py-3 font-medium text-text-primary">{client.fullName}</td>
                        <td className="px-4 py-3 text-text-secondary capitalize">{client.clientType}</td>
                        <td className="px-4 py-3"><StatusBadge status={client.status} /></td>
                        <td className="px-4 py-3 text-text-secondary">{client.email ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-text-muted">{data.total} client{data.total !== 1 ? 's' : ''}</p>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 text-sm text-text-secondary">{page} / {totalPages}</span>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
