import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/auth/LoginPage'
import { SetPasswordPage } from './pages/auth/SetPasswordPage'

export const router = createBrowserRouter([
  {
    path: '/auth/login',
    element: <LoginPage />,
  },
  {
    path: '/auth/setup-password',
    element: <SetPasswordPage mode="invite" />,
  },
  {
    path: '/auth/reset-password',
    element: <SetPasswordPage mode="reset" />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <div className="p-8 text-text-secondary">Dashboard — coming in Phase 2</div>,
      },
    ],
  },
])
