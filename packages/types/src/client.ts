export type ClientType = 'individual' | 'corporate'
export type ClientStatus = 'active' | 'dormant' | 'closed'

export interface Client {
  id: string
  clientId: string              // CLT-YYYY-NNNNN
  clientType: ClientType
  fullName: string
  idNumber: string | null
  contactPerson: string | null  // corporate only
  phone: string | null
  email: string | null
  postalAddress: string | null
  kraPin: string | null
  status: ClientStatus
  hasConflict: boolean
  conflictNotes: string | null
  internalNotes: string | null
  createdBy: string             // user id
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface CreateClientInput {
  clientType: ClientType
  fullName: string
  idNumber?: string
  contactPerson?: string
  phone?: string
  email?: string
  postalAddress?: string
  kraPin?: string
  hasConflict?: boolean
  conflictNotes?: string
  internalNotes?: string
}

export type UpdateClientInput = Partial<Omit<CreateClientInput, 'clientType'>> & {
  status?: ClientStatus
}
