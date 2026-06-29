import { useOffline } from '../hooks/useOffline'

export function OfflineIndicator() {
  const isOffline = useOffline()
  if (!isOffline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 bg-status-urgent text-white text-sm font-medium py-2 text-center"
    >
      You are offline. The app is in read-only mode.
    </div>
  )
}
