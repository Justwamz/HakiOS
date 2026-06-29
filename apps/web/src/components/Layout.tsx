import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { api } from '../lib/api'

export function Layout() {
  const { user, refreshToken, clearAuth } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      if (refreshToken) {
        await api('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        })
      }
    } finally {
      clearAuth()
      navigate('/auth/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary text-white px-6 py-3 flex items-center justify-between shadow">
        <span className="font-semibold text-lg tracking-tight">HakiOS</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="opacity-75">
            {user?.firstName} {user?.lastName}
          </span>
          <button
            onClick={handleLogout}
            className="underline opacity-75 hover:opacity-100 transition-opacity"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
