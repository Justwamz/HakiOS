import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/auth/LoginPage'
import { SetPasswordPage } from './pages/auth/SetPasswordPage'
import { RequestResetPage } from './pages/auth/RequestResetPage'
import { DashboardPage } from './pages/DashboardPage'
import { ClientsListPage } from './pages/clients/ClientsListPage'
import { CreateClientPage } from './pages/clients/CreateClientPage'
import { ClientDetailPage } from './pages/clients/ClientDetailPage'
import { MattersListPage } from './pages/matters/MattersListPage'
import { CreateMatterPage } from './pages/matters/CreateMatterPage'
import { MatterDetailPage } from './pages/matters/MatterDetailPage'

export const router = createBrowserRouter([
  { path: '/auth/login', element: <LoginPage /> },
  { path: '/auth/setup-password', element: <SetPasswordPage mode="invite" /> },
  { path: '/auth/reset-password', element: <SetPasswordPage mode="reset" /> },
  { path: '/auth/reset-password/request', element: <RequestResetPage /> },
  {
    path: '/',
    element: <ProtectedRoute><Layout /></ProtectedRoute>,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'clients', element: <ClientsListPage /> },
      { path: 'clients/new', element: <CreateClientPage /> },
      { path: 'clients/:id', element: <ClientDetailPage /> },
      { path: 'matters', element: <MattersListPage /> },
      { path: 'matters/new', element: <CreateMatterPage /> },
      { path: 'matters/:id', element: <MatterDetailPage /> },
    ],
  },
])
