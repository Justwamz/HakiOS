export interface AuditLog {
  id: string
  userId: string | null
  action: string
  recordType: string
  recordId: string
  beforeValue: Record<string, unknown> | null
  afterValue: Record<string, unknown> | null
  createdAt: string
}
