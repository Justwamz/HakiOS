export interface CaseNumberSettings {
  firmPrefix: string            // max 6 chars, e.g. 'LF'
  includeTypeCode: boolean
  includeYear: boolean
  sequenceDigits: 4 | 5 | 6
  separator: '/' | '-' | '.'
}

export interface FirmProfile {
  firmName: string
  address: string
  phone: string
  email: string
}

export interface ReminderSchedule {
  id: string
  eventType: string
  daysBefore: number
  createdAt: string
}

export interface SystemSettings {
  caseNumber: CaseNumberSettings
  firm: FirmProfile
  emailDeliveryMode: 'realtime' | 'digest'
  digestSendTime: string        // HH:MM (EAT)
  escalationThresholdHours: number
}
