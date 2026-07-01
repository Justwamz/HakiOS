import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { api } from '../lib/api'
import { hasPermission } from '@hakios/types'

export function Layout() {
  const { user, refreshToken, clearAuth } = useAuthStore()
  const navigate = useNavigate()

  const canManageUsers = user ? hasPermission(user.role, 'users:manage') : false
  const canManageSettings = user ? hasPermission(user.role, 'settings:manage') : false

  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!user) return
    const fetchCount = () => {
      api<{ count: number }>('/notifications/count')
        .then(data => setUnreadCount(data.count))
        .catch(() => {})
    }
    fetchCount()
    const interval = setInterval(fetchCount, 60_000)
    return () => clearInterval(interval)
  }, [user])

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
        <div className="px-6 py-5 border-b border-white/10 flex items-start justify-between">
          <div>
            <span className="text-white font-semibold text-lg tracking-tight">HakiOS</span>
            <p className="text-white/50 text-xs mt-0.5">Practice Management</p>
          </div>
          <Link
            to="/notifications"
            className="relative mt-0.5 text-white/70 hover:text-white transition-colors"
            aria-label="Notifications"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-status-overdue-bg text-status-overdue-text text-xs font-bold min-w-[1.1rem] h-[1.1rem] rounded-full flex items-center justify-center px-0.5">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
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
          <p className="text-xs text-white/60 capitalize">{user?.role}</p>
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
