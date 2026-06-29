import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { OfflineIndicator } from './components/OfflineIndicator'
import { usePushNotifications } from './hooks/usePushNotifications'

export default function App() {
  usePushNotifications()
  return (
    <>
      <OfflineIndicator />
      <RouterProvider router={router} />
    </>
  )
}
