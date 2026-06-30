import type { PoolClient } from 'pg'
import { db } from '../db/client.js'

interface AuditParams {
  userId: string
  action: string
  recordType: string
  recordId: string
  beforeValue?: unknown
  afterValue?: unknown
}

export async function writeAuditLog(params: AuditParams, pgClient?: PoolClient): Promise<void> {
  const executor = pgClient ?? db
  await executor.query(
    `INSERT INTO audit_log (user_id, action, record_type, record_id, before_value, after_value)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.userId,
      params.action,
      params.recordType,
      params.recordId,
      params.beforeValue !== undefined ? JSON.stringify(params.beforeValue) : null,
      params.afterValue !== undefined ? JSON.stringify(params.afterValue) : null,
    ],
  )
}
