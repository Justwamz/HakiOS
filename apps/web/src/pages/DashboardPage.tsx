import { PageHeader } from '../components/PageHeader'

export function DashboardPage() {
  return (
    <div>
      <PageHeader title="Dashboard" />
      <div className="p-4 md:p-8">
        <p className="text-text-secondary text-sm">Matter analytics coming in Phase 2.</p>
      </div>
    </div>
  )
}
