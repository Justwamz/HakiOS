import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { User } from '@hakios/types'
import { hasPermission } from '@hakios/types'
import { api } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { useAuthStore } from '../../store/auth'

export function UsersPage() {
  const { user } = useAuthStore()
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  function loadUsers() {
    api<User[]>('/users')
      .then(setUsers)
      .catch((err: Error) => setError(err.message))
  }

  useEffect(() => {
    loadUsers()
  }, [])

  // Permission guard — after all hooks
  if (!user || !hasPermission(user.role, 'users:manage')) {
    return <Navigate to="/" replace />
  }

  async function handleToggle(u: User) {
    setToggling(u.id)
    try {
      const updated = await api<User>(`/users/${u.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !u.isActive }),
      })
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setToggling(null)
    }
  }

  const ROLE_LABEL: Record<string, string> = {
    admin: 'Admin',
    partner: 'Partner',
    associate: 'Associate',
    clerk: 'Clerk',
  }

  return (
    <div>
      <PageHeader
        title="Users"
        action={
          <Link
            to="/users/invite"
            className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            Invite user
          </Link>
        }
      />
      <div className="p-8">
        {error && <p className="text-sm text-status-overdue mb-4">{error}</p>}
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-background border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id} className={u.isActive ? '' : 'opacity-50'}>
                  <td className="px-4 py-3 text-text-primary font-medium">{u.firstName} {u.lastName}</td>
                  <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                  <td className="px-4 py-3 text-text-secondary capitalize">{ROLE_LABEL[u.role] ?? u.role}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.isActive ? 'bg-status-active-bg text-status-active-text' : 'bg-background text-text-muted'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleToggle(u)}
                      disabled={toggling === u.id}
                      className="text-xs text-text-secondary hover:text-text-primary underline disabled:opacity-50 transition"
                    >
                      {toggling === u.id ? '…' : u.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-text-muted text-sm">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
