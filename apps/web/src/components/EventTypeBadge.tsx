import type { EventType } from '@hakios/types'

const LABELS: Record<EventType, string> = {
  court_hearing: 'Court Hearing',
  filing_deadline: 'Filing Deadline',
  submission_deadline: 'Submission Deadline',
  mention: 'Mention',
  client_meeting: 'Client Meeting',
  internal_review: 'Internal Review',
}

// Tokens from StatusBadge.tsx:
//   urgent/overdue  → bg-status-pending-bg text-status-pending-text  (amber/warning)
//   neutral         → bg-status-dormant-bg text-status-dormant-text   (grey)
//   positive/info   → bg-status-active-bg  text-status-active-text    (green)
const CLASSES: Record<EventType, string> = {
  court_hearing:       'bg-status-pending-bg text-status-pending-text',
  filing_deadline:     'bg-status-pending-bg text-status-pending-text',
  submission_deadline: 'bg-status-pending-bg text-status-pending-text',
  mention:             'bg-status-dormant-bg text-status-dormant-text',
  client_meeting:      'bg-status-active-bg text-status-active-text',
  internal_review:     'bg-status-dormant-bg text-status-dormant-text',
}

export function EventTypeBadge({ type }: { type: EventType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLASSES[type]}`}
    >
      {LABELS[type]}
    </span>
  )
}
