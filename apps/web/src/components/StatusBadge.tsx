import type { ClientStatus, MatterStatus } from '@hakios/types'

type Status = ClientStatus | MatterStatus

const STATUS_CONFIG: Record<Status, { label: string; className: string }> = {
  active:    { label: 'Active',     className: 'bg-green-100 text-green-800' },
  dormant:   { label: 'Dormant',    className: 'bg-gray-100 text-gray-600' },
  closed:    { label: 'Closed',     className: 'bg-red-100 text-red-700' },
  pending:   { label: 'Pending',    className: 'bg-yellow-100 text-yellow-800' },
  adjourned: { label: 'Adjourned',  className: 'bg-orange-100 text-orange-700' },
  on_appeal: { label: 'On Appeal',  className: 'bg-blue-100 text-blue-800' },
  settled:   { label: 'Settled',    className: 'bg-purple-100 text-purple-700' },
}

interface Props {
  status: Status
}

export function StatusBadge({ status }: Props) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
