import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Matter } from '@hakios/types'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'

interface PaginatedMatters {
  items: Matter[]
  total: number
  page: number
  limit: number
}

const STATUSES = ['active', 'pending', 'adjourned', 'on_appeal', 'settled', 'closed'] as const

export function MattersListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const clientId = searchParams.get('clientId')

  const [data, setData] = useState<PaginatedMatters | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (status) params.set('status', status)
    if (clientId) params.set('clientId', clientId)
    params.set('page', String(page))
    params.set('limit', '20')
    setError(null)
    api<PaginatedMatters>(`/matters?${params.toString()}`)
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [search, status, page, clientId])

  const totalPages = data ? Math.ceil(data.total / (data.limit || 20)) : 0

  return (
    <div>
      <PageHeader
        title="Matters"
        action={
          <Link
            to="/matters/new"
            className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            New matter
          </Link>
        }
      />
      <div className="p-4 md:p-8">
        <div className="flex gap-3 mb-6">
          <input
            type="search"
            placeholder="Search by matter number or description…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full sm:w-72"
          />
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-status-overdue text-sm mb-4">{error}</p>}

        {!data ? (
          <p className="text-text-muted text-sm">Loading…</p>
        ) : (
          <>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-background border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Matter No.</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">Opened</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-muted">No matters found</td>
                    </tr>
                  ) : (
                    data.items.map((matter) => (
                      <tr
                        key={matter.id}
                        className="hover:bg-background cursor-pointer"
                        onClick={() => navigate(`/matters/${matter.id}`)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-text-secondary">{matter.matterNumber}</td>
                        <td className="px-4 py-3 text-text-primary max-w-xs truncate">{matter.description}</td>
                        <td className="px-4 py-3 text-text-secondary">{matter.matterType}</td>
                        <td className="px-4 py-3"><StatusBadge status={matter.status} /></td>
                        <td className="px-4 py-3 text-text-secondary">{matter.dateOpened}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table></div>
            </div>
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-y-2 mt-4">
                <p className="text-sm text-text-muted">{data.total} matter{data.total !== 1 ? 's' : ''}</p>
                <div className="flex gap-2">
                  <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40">Previous</button>
                  <span className="px-3 py-1.5 text-sm text-text-secondary">{page} / {totalPages}</span>
                  <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
