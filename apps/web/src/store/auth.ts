import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@hakios/types'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  setAuth: (user: User, accessToken: string, refreshToken: string) => void
  setAccessToken: (accessToken: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clearAuth: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: 'hakios-auth',
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken,
        // accessToken NOT persisted — short-lived, refreshed on load
      }),
    },
  ),
)
