import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { OfflineIndicator } from './components/OfflineIndicator'

export default function App() {
  return (
    <>
      <OfflineIndicator />
      <RouterProvider router={router} />
    </>
  )
}
