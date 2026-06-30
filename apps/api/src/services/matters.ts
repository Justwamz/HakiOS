import { db } from '../db/client.js'
import type { PoolClient } from 'pg'
import { generateMatterNumber } from '@hakios/utils'
import type {
  Matter,
  MatterStatus,
  CreateMatterInput,
  UpdateMatterInput,
  CloseMatterInput,
  CaseNumberSettings,
} from '@hakios/types'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../lib/audit.js'

export interface ListMattersOptions {
  clientId?: string
  status?: MatterStatus
  search?: string
  page: number
  limit: number
  userId: string
  canReadAll: boolean
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

const MATTER_SELECT = `
  SELECT m.*,
    COALESCE(ARRAY_AGG(DISTINCT mc.user_id) FILTER (WHERE mc.user_id IS NOT NULL), '{}') AS clerk_ids,
    COALESCE(ARRAY_AGG(DISTINCT rm.related_matter_id) FILTER (WHERE rm.related_matter_id IS NOT NULL), '{}') AS related_matter_ids
  FROM matters m
  LEFT JOIN matter_clerks mc ON mc.matter_id = m.id
  LEFT JOIN related_matters rm ON rm.matter_id = m.id
`

function toMatter(row: Record<string, unknown>): Matter {
  return {
    id: row['id'] as string,
    matterNumber: row['matter_number'] as string,
    clientId: row['client_id'] as string,
    matterType: row['matter_type'] as string,
    description: row['description'] as string,
    status: row['status'] as Matter['status'],
    leadAdvocateId: (row['lead_advocate_id'] as string | null) ?? null,
    supervisingPartnerId: (row['supervising_partner_id'] as string | null) ?? null,
    clerkIds: (row['clerk_ids'] as string[]) ?? [],
    opposingParty: (row['opposing_party'] as string | null) ?? null,
    opposingAdvocate: (row['opposing_advocate'] as string | null) ?? null,
    courtName: (row['court_name'] as string | null) ?? null,
    courtStation: (row['court_station'] as string | null) ?? null,
    courtDivision: (row['court_division'] as string | null) ?? null,
    courtFileNumber: (row['court_file_number'] as string | null) ?? null,
    judge: (row['judge'] as string | null) ?? null,
    nextAction: (row['next_action'] as string | null) ?? null,
    nextActionDue: row['next_action_due']
      ? (row['next_action_due'] as Date).toISOString().slice(0, 10)
      : null,
    relatedMatterIds: (row['related_matter_ids'] as string[]) ?? [],
    dateOpened: (row['date_opened'] as Date).toISOString().slice(0, 10),
    dateClosed: row['date_closed']
      ? (row['date_closed'] as Date).toISOString().slice(0, 10)
      : null,
    openedBy: row['opened_by'] as string,
    updatedBy: row['updated_by'] as string,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  }
}

/** Read full matter row within an existing transaction connection. */
async function getMatterTx(id: string, pgClient: PoolClient): Promise<Matter> {
  const { rows } = await pgClient.query(
    `${MATTER_SELECT} WHERE m.id = $1 GROUP BY m.id`,
    [id],
  )
  const row = rows[0]
  if (!row) throw createError('Matter not found', 404, 'NOT_FOUND')
  return toMatter(row)
}

async function nextMatterSeq(year: number, pgClient: PoolClient): Promise<number> {
  const { rows } = await pgClient.query<{ seq: number }>(
    `INSERT INTO matter_sequences (year, next_val)
     VALUES ($1, 2)
     ON CONFLICT (year) DO UPDATE SET next_val = matter_sequences.next_val + 1
     RETURNING next_val - 1 AS seq`,
    [year],
  )
  const row = rows[0]
  if (!row) throw new Error('Sequence upsert returned no row')
  return row.seq
}

async function getCaseNumberSettings(pgClient: PoolClient): Promise<CaseNumberSettings> {
  const { rows } = await pgClient.query<{ value: CaseNumberSettings }>(
    `SELECT value FROM settings WHERE key = 'case_number'`,
  )
  if (!rows[0]) throw createError('Case number settings not configured', 500)
  return rows[0].value
}

export async function listMatters(opts: ListMattersOptions): Promise<PaginatedResult<Matter>> {
  const conditions: string[] = []
  const vals: unknown[] = []
  let i = 1

  if (!opts.canReadAll) {
    conditions.push(`m.id IN (
      SELECT id FROM matters
      WHERE lead_advocate_id = $${i} OR supervising_partner_id = $${i}
         OR id IN (SELECT matter_id FROM matter_clerks WHERE user_id = $${i})
    )`)
    vals.push(opts.userId)
    i++
  }

  if (opts.clientId) {
    conditions.push(`m.client_id = $${i}`)
    vals.push(opts.clientId)
    i++
  }

  if (opts.status) {
    conditions.push(`m.status = $${i}`)
    vals.push(opts.status)
    i++
  }

  if (opts.search) {
    conditions.push(`(m.matter_number ILIKE $${i} OR m.description ILIKE $${i})`)
    vals.push(`%${opts.search}%`)
    i++
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (opts.page - 1) * opts.limit

  const [countRes, rowsRes] = await Promise.all([
    db.query<{ total: string }>(
      `SELECT COUNT(DISTINCT m.id) AS total FROM matters m ${where}`,
      vals,
    ),
    db.query(
      `${MATTER_SELECT} ${where} GROUP BY m.id ORDER BY m.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...vals, opts.limit, offset],
    ),
  ])

  const countRow = countRes.rows[0]
  if (!countRow) throw new Error('COUNT query returned no row')

  return {
    items: rowsRes.rows.map(toMatter),
    total: parseInt(countRow.total, 10),
    page: opts.page,
    limit: opts.limit,
  }
}

export async function getMatter(id: string): Promise<Matter> {
  const { rows } = await db.query(
    `${MATTER_SELECT} WHERE m.id = $1 GROUP BY m.id`,
    [id],
  )
  if (!rows[0]) throw createError('Matter not found', 404, 'NOT_FOUND')
  return toMatter(rows[0])
}

export async function userCanAccessMatter(userId: string, matterId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM matters
     WHERE id = $1
       AND (lead_advocate_id = $2 OR supervising_partner_id = $2
            OR id IN (SELECT matter_id FROM matter_clerks WHERE user_id = $2))
     LIMIT 1`,
    [matterId, userId],
  )
  return rows.length > 0
}

export async function createMatter(input: CreateMatterInput, userId: string): Promise<Matter> {
  const year = new Date().getFullYear()
  const pgClient = await db.connect()
  let matterId: string | undefined
  try {
    await pgClient.query('BEGIN')
    const settings = await getCaseNumberSettings(pgClient)
    const seq = await nextMatterSeq(year, pgClient)
    const matterNumber = generateMatterNumber(settings, input.matterType, year, seq)

    const { rows } = await pgClient.query<{ id: string }>(
      `INSERT INTO matters (
        matter_number, client_id, matter_type, description,
        lead_advocate_id, supervising_partner_id,
        opposing_party, opposing_advocate,
        court_name, court_station, court_division, court_file_number, judge,
        next_action, next_action_due, opened_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
      RETURNING id`,
      [
        matterNumber, input.clientId, input.matterType, input.description,
        input.leadAdvocateId ?? null, input.supervisingPartnerId ?? null,
        input.opposingParty ?? null, input.opposingAdvocate ?? null,
        input.courtName ?? null, input.courtStation ?? null,
        input.courtDivision ?? null, input.courtFileNumber ?? null,
        input.judge ?? null, input.nextAction ?? null, input.nextActionDue ?? null,
        userId,
      ],
    )
    const insertedRow = rows[0]
    if (!insertedRow) throw new Error('Matter INSERT returned no row')
    matterId = insertedRow.id

    if (input.clerkIds?.length) {
      const placeholders = input.clerkIds.map((_, k) => `($1, $${k + 2})`).join(', ')
      await pgClient.query(
        `INSERT INTO matter_clerks (matter_id, user_id) VALUES ${placeholders}`,
        [matterId, ...input.clerkIds],
      )
    }

    await pgClient.query(
      `INSERT INTO matter_timeline (matter_id, event_type, description, created_by)
       VALUES ($1, 'status_change', 'Matter opened', $2)`,
      [matterId, userId],
    )

    // Read the full matter within the transaction to capture afterValue for audit log
    const createdMatter = await getMatterTx(matterId, pgClient)
    await writeAuditLog(
      { userId, action: 'CREATE', recordType: 'matter', recordId: matterId, afterValue: createdMatter },
      pgClient,
    )

    await pgClient.query('COMMIT')
    return createdMatter
  } catch (err) {
    await pgClient.query('ROLLBACK')
    throw err
  } finally {
    pgClient.release()
  }
}

export async function updateMatter(
  id: string,
  input: UpdateMatterInput,
  userId: string,
): Promise<Matter> {
  const pgClient = await db.connect()
  try {
    await pgClient.query('BEGIN')

    // Lock the row for the duration of the transaction (prevents TOCTOU)
    const existingRes = await pgClient.query(
      'SELECT * FROM matters WHERE id = $1 FOR UPDATE',
      [id],
    )
    const existingRow = existingRes.rows[0]
    if (!existingRow) throw createError('Matter not found', 404, 'NOT_FOUND')
    const existing = toMatter(existingRow)

    const fieldMap: Record<string, string> = {
      description: 'description',
      leadAdvocateId: 'lead_advocate_id', supervisingPartnerId: 'supervising_partner_id',
      opposingParty: 'opposing_party', opposingAdvocate: 'opposing_advocate',
      courtName: 'court_name', courtStation: 'court_station',
      courtDivision: 'court_division', courtFileNumber: 'court_file_number',
      judge: 'judge', nextAction: 'next_action', nextActionDue: 'next_action_due',
      status: 'status',
    }

    const setClauses: string[] = []
    const vals: unknown[] = []
    let i = 1

    for (const [jsKey, col] of Object.entries(fieldMap)) {
      if (jsKey in input) {
        setClauses.push(`${col} = $${i}`)
        const v = input[jsKey as keyof UpdateMatterInput]
        vals.push(v !== undefined ? v : null)
        i++
      }
    }

    if (setClauses.length > 0) {
      setClauses.push(`updated_by = $${i}`, `updated_at = now()`)
      vals.push(userId)
      i++
      vals.push(id)
      await pgClient.query(
        `UPDATE matters SET ${setClauses.join(', ')} WHERE id = $${i}`,
        vals,
      )
    }

    if (input.clerkIds !== undefined) {
      await pgClient.query('DELETE FROM matter_clerks WHERE matter_id = $1', [id])
      if (input.clerkIds.length > 0) {
        const placeholders = input.clerkIds.map((_, k) => `($1, $${k + 2})`).join(', ')
        await pgClient.query(
          `INSERT INTO matter_clerks (matter_id, user_id) VALUES ${placeholders}`,
          [id, ...input.clerkIds],
        )
      }
    }

    if (input.status && input.status !== existing.status) {
      await pgClient.query(
        `INSERT INTO matter_timeline (matter_id, event_type, description, created_by)
         VALUES ($1, 'status_change', $2, $3)`,
        [id, `Status changed from ${existing.status} to ${input.status}`, userId],
      )
    }

    // Read updated state within transaction for audit log
    const updatedMatter = await getMatterTx(id, pgClient)
    await writeAuditLog(
      { userId, action: 'UPDATE', recordType: 'matter', recordId: id, beforeValue: existing, afterValue: updatedMatter },
      pgClient,
    )

    await pgClient.query('COMMIT')
    return updatedMatter
  } catch (err) {
    await pgClient.query('ROLLBACK')
    throw err
  } finally {
    pgClient.release()
  }
}

export async function closeMatter(
  id: string,
  input: CloseMatterInput,
  userId: string,
): Promise<Matter> {
  const dateClosed = input.dateClosed ?? new Date().toISOString().slice(0, 10)
  const pgClient = await db.connect()
  try {
    await pgClient.query('BEGIN')
    const { rows } = await pgClient.query(
      'SELECT * FROM matters WHERE id = $1 FOR UPDATE',
      [id],
    )
    const existingRow = rows[0]
    if (!existingRow) throw createError('Matter not found', 404, 'NOT_FOUND')
    if (existingRow['status'] === 'closed') throw createError('Matter is already closed', 409, 'ALREADY_CLOSED')
    const existingMatter = toMatter(existingRow)

    await pgClient.query(
      `UPDATE matters SET status = 'closed', date_closed = $1, updated_by = $2, updated_at = now() WHERE id = $3`,
      [dateClosed, userId, id],
    )
    await pgClient.query(
      `INSERT INTO matter_timeline (matter_id, event_type, description, created_by)
       VALUES ($1, 'closure', $2, $3)`,
      [id, input.closureNote ?? 'Matter closed', userId],
    )

    // Read closed state within transaction for audit log
    const closedMatter = await getMatterTx(id, pgClient)
    await writeAuditLog(
      { userId, action: 'CLOSE', recordType: 'matter', recordId: id, beforeValue: existingMatter, afterValue: closedMatter },
      pgClient,
    )

    await pgClient.query('COMMIT')
    return closedMatter
  } catch (err) {
    await pgClient.query('ROLLBACK')
    throw err
  } finally {
    pgClient.release()
  }
}
