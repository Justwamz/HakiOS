export type MatterStatus =
  | 'active'
  | 'pending'
  | 'adjourned'
  | 'on_appeal'
  | 'settled'
  | 'closed'

export interface MatterTypeCode {
  code: string
  label: string
  isActive: boolean
  createdAt: string
}

export interface Matter {
  id: string
  matterNumber: string
  clientId: string
  matterType: string        // references MatterTypeCode.code
  description: string
  status: MatterStatus
  leadAdvocateId: string | null
  leadAdvocateName: string | null
  supervisingPartnerId: string | null
  supervisingPartnerName: string | null
  clerkIds: string[]
  clerkNames: string[]
  opposingParty: string | null
  opposingAdvocate: string | null
  courtName: string | null
  courtStation: string | null
  courtDivision: string | null
  courtFileNumber: string | null
  judge: string | null
  nextAction: string | null
  nextActionDue: string | null  // YYYY-MM-DD
  relatedMatterIds: string[]
  dateOpened: string            // YYYY-MM-DD
  dateClosed: string | null
  openedBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface MatterTimelineEntry {
  id: string
  matterId: string
  eventType: 'status_change' | 'assignment_change' | 'note' | 'event_linked' | 'closure'
  description: string
  createdBy: string
  createdAt: string
}

export interface CreateMatterInput {
  clientId: string
  matterType: string
  description: string
  leadAdvocateId?: string
  supervisingPartnerId?: string
  clerkIds?: string[]
  opposingParty?: string
  opposingAdvocate?: string
  courtName?: string
  courtStation?: string
  courtDivision?: string
  courtFileNumber?: string
  judge?: string
  nextAction?: string
  nextActionDue?: string
}

export interface UpdateMatterInput {
  description?: string
  leadAdvocateId?: string | null
  supervisingPartnerId?: string | null
  clerkIds?: string[]
  opposingParty?: string | null
  opposingAdvocate?: string | null
  courtName?: string | null
  courtStation?: string | null
  courtDivision?: string | null
  courtFileNumber?: string | null
  judge?: string | null
  nextAction?: string | null
  nextActionDue?: string | null
  status?: MatterStatus
}

export interface CloseMatterInput {
  dateClosed?: string
  closureNote?: string
}
