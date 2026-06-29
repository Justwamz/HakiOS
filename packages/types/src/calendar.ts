export type EventType =
  | 'court_hearing'
  | 'filing_deadline'
  | 'submission_deadline'
  | 'mention'
  | 'client_meeting'
  | 'internal_review'

export type RecurrenceType = 'none' | 'weekly' | 'monthly' | 'custom'

export interface CalendarEvent {
  id: string
  eventType: EventType
  title: string
  matterId: string
  clientId: string              // inherited from matter
  date: string                  // YYYY-MM-DD
  time: string | null           // HH:MM
  assigneeIds: string[]
  supervisingPartnerId: string | null
  notes: string | null
  recurrence: RecurrenceType
  recurrenceParentId: string | null
  isResolved: boolean
  acknowledgedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CreateCalendarEventInput {
  eventType: EventType
  title: string
  matterId: string
  date: string
  time?: string
  assigneeIds?: string[]
  supervisingPartnerId?: string
  notes?: string
  recurrence?: RecurrenceType
}
