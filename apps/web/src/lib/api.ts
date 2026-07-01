import { useAuthStore } from '../store/auth'

const BASE = (import.meta.env['VITE_API_URL'] ?? '') + '/api'

interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

let refreshPromise: Promise<string> | null = null

async function doRefresh(): Promise<string> {
  const { refreshToken, clearAuth, user } = useAuthStore.getState()
  if (!refreshToken) {
    clearAuth()
    throw new Error('No refresh token')
  }

  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!res.ok) {
    clearAuth()
    throw new Error('Session expired')
  }

  const data = (await res.json()) as RefreshResponse
  if (user) {
    useAuthStore.getState().setAuth(user, data.accessToken, data.refreshToken)
  } else {
    useAuthStore.getState().setAccessToken(data.accessToken)
  }
  return data.accessToken
}

async function getValidToken(): Promise<string | null> {
  const { accessToken, refreshToken } = useAuthStore.getState()
  if (!accessToken) {
    if (!refreshToken) return null
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => { refreshPromise = null })
    }
    return refreshPromise
  }

  try {
    const parts = accessToken.split('.')
    const payload = JSON.parse(atob(parts[1] ?? '')) as { exp: number }
    const expiresAt = payload.exp * 1000
    if (expiresAt - Date.now() > 60_000) return accessToken
  } catch {
    // Can't parse expiry — attempt a refresh rather than sending a potentially invalid token
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => {
        refreshPromise = null
      })
    }
    return refreshPromise
  }

  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getValidToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string }
    const err = new Error(body.error ?? 'Request failed') as Error & { status: number }
    err.status = res.status
    throw err
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
