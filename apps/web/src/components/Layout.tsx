import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { api } from '../lib/api'
import { hasPermission } from '@hakios/types'

export function Layout() {
  const { user, refreshToken, clearAuth } = useAuthStore()
  const navigate = useNavigate()

  const canManageUsers = user ? hasPermission(user.role, 'users:manage') : false
  const canManageSettings = user ? hasPermission(user.role, 'settings:manage') : false

  const NAV_ITEMS = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/clients', label: 'Clients' },
    { to: '/matters', label: 'Matters' },
    { to: '/calendar', label: 'Calendar' },
    ...(canManageUsers ? [{ to: '/users', label: 'Users' }] : []),
    ...(canManageSettings ? [{ to: '/settings', label: 'Settings' }] : []),
  ]

  async function handleLogout() {
    try {
      if (refreshToken) {
        await api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) })
      }
    } finally {
      clearAuth()
      navigate('/auth/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-60 bg-primary flex flex-col shrink-0">
        <div className="px-6 py-5 border-b border-white/10">
          <span className="text-white font-semibold text-lg tracking-tight">HakiOS</span>
          <p className="text-white/50 text-xs mt-0.5">Practice Management</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-white/10">
          <p className="text-sm font-medium text-white truncate">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="text-xs text-white/60 capitalize">
            {user?.role}
          </p>
          <button
            onClick={handleLogout}
            className="text-white/60 hover:text-white text-xs underline transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
