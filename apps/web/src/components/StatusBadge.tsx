import type { ClientStatus, MatterStatus } from '@hakios/types'

type Status = ClientStatus | MatterStatus

const STATUS_CONFIG: Record<Status, { label: string; className: string }> = {
  active:    { label: 'Active',     className: 'bg-status-active-bg text-status-active-text' },
  pending:   { label: 'Pending',    className: 'bg-status-pending-bg text-status-pending-text' },
  adjourned: { label: 'Adjourned',  className: 'bg-status-adjourned-bg text-status-adjourned-text' },
  on_appeal: { label: 'On Appeal',  className: 'bg-status-on-appeal-bg text-status-on-appeal-text' },
  settled:   { label: 'Settled',    className: 'bg-status-settled-bg text-status-settled-text' },
  closed:    { label: 'Closed',     className: 'bg-status-closed-bg text-status-closed-text' },
  dormant:   { label: 'Dormant',    className: 'bg-status-dormant-bg text-status-dormant-text' },
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
