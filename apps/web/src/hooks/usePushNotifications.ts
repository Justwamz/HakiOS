/// <reference types="vite/client" />
import { useEffect } from 'react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'

const VAPID_PUBLIC_KEY = import.meta.env['VITE_VAPID_PUBLIC_KEY'] as string | undefined

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const { user } = useAuthStore()

  useEffect(() => {
    if (!user || !VAPID_PUBLIC_KEY || !('serviceWorker' in navigator)) return

    async function subscribe() {
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      if (existing) return

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!).buffer as ArrayBuffer,
      })

      await api('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription.toJSON()),
      })
    }

    subscribe().catch(console.error)
  }, [user])
}
