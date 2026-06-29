import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from '../pages/auth/LoginPage'

vi.mock('../lib/api', () => ({
  api: vi.fn(),
}))

const mockSetAuth = vi.fn()
vi.mock('../store/auth', () => ({
  useAuthStore: () => ({
    setAuth: mockSetAuth,
    user: null,
    accessToken: null,
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null }),
  }
})

import { api } from '../lib/api'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LoginPage', () => {
  function renderPage() {
    return render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
  }

  it('renders email and password fields', () => {
    renderPage()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('shows validation errors when submitted empty', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument()
    })
  })

  it('calls api and setAuth on successful login', async () => {
    const mockUser = { id: '1', email: 'a@b.com', firstName: 'Ada', role: 'partner' }
    vi.mocked(api).mockResolvedValueOnce({
      accessToken: 'access-tok',
      refreshToken: 'refresh-tok',
      user: mockUser,
    })

    renderPage()
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'Test@1234!')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockSetAuth).toHaveBeenCalledWith(mockUser, 'access-tok', 'refresh-tok')
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('shows an error message on failed login', async () => {
    const err = Object.assign(new Error('Invalid email or password'), { status: 401 })
    vi.mocked(api).mockRejectedValueOnce(err)

    renderPage()
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'Wrong@1!')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
    })
  })
})
