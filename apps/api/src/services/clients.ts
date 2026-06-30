import { db } from '../db/client.js'
import type { PoolClient } from 'pg'
import { generateClientId } from '@hakios/utils'
import type { Client, ClientStatus, CreateClientInput, UpdateClientInput } from '@hakios/types'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../lib/audit.js'

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

export interface ListClientsOptions {
  search?: string
  status?: ClientStatus
  page: number
  limit: number
  userId: string
  canReadAll: boolean
}

function toClient(row: Record<string, unknown>): Client {
  return {
    id: row['id'] as string,
    clientId: row['client_id'] as string,
    clientType: row['client_type'] as Client['clientType'],
    fullName: row['full_name'] as string,
    idNumber: (row['id_number'] as string | null) ?? null,
    contactPerson: (row['contact_person'] as string | null) ?? null,
    phone: (row['phone'] as string | null) ?? null,
    email: (row['email'] as string | null) ?? null,
    postalAddress: (row['postal_address'] as string | null) ?? null,
    kraPin: (row['kra_pin'] as string | null) ?? null,
    status: row['status'] as Client['status'],
    hasConflict: Boolean(row['has_conflict']),
    conflictNotes: (row['conflict_notes'] as string | null) ?? null,
    internalNotes: (row['internal_notes'] as string | null) ?? null,
    createdBy: row['created_by'] as string,
    updatedBy: row['updated_by'] as string,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  }
}

async function nextClientSeq(year: number, pgClient: PoolClient): Promise<number> {
  const { rows } = await pgClient.query<{ seq: number }>(
    `INSERT INTO client_sequences (year, next_val)
     VALUES ($1, 2)
     ON CONFLICT (year) DO UPDATE SET next_val = client_sequences.next_val + 1
     RETURNING next_val - 1 AS seq`,
    [year],
  )
  return rows[0]!.seq
}

export async function listClients(opts: ListClientsOptions): Promise<PaginatedResult<Client>> {
  const conditions: string[] = []
  const vals: unknown[] = []
  let i = 1

  if (!opts.canReadAll) {
    conditions.push(`id IN (
      SELECT DISTINCT client_id FROM matters
      WHERE lead_advocate_id = $${i}
         OR supervising_partner_id = $${i}
         OR id IN (SELECT matter_id FROM matter_clerks WHERE user_id = $${i})
    )`)
    vals.push(opts.userId)
    i++
  }

  if (opts.search) {
    conditions.push(`(full_name ILIKE $${i} OR client_id ILIKE $${i})`)
    vals.push(`%${opts.search}%`)
    i++
  }

  if (opts.status) {
    conditions.push(`status = $${i}`)
    vals.push(opts.status)
    i++
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (opts.page - 1) * opts.limit

  const [countRes, rowsRes] = await Promise.all([
    db.query<{ total: string }>(`SELECT COUNT(*) AS total FROM clients ${where}`, vals),
    db.query(
      `SELECT * FROM clients ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...vals, opts.limit, offset],
    ),
  ])

  return {
    items: rowsRes.rows.map(toClient),
    total: parseInt(countRes.rows[0]!.total, 10),
    page: opts.page,
    limit: opts.limit,
  }
}

export async function getClient(id: string): Promise<Client> {
  const { rows } = await db.query('SELECT * FROM clients WHERE id = $1', [id])
  if (!rows[0]) throw createError('Client not found', 404, 'NOT_FOUND')
  return toClient(rows[0])
}

export async function userCanAccessClient(userId: string, clientId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM matters
     WHERE client_id = $1
       AND (lead_advocate_id = $2 OR supervising_partner_id = $2
            OR id IN (SELECT matter_id FROM matter_clerks WHERE user_id = $2))
     LIMIT 1`,
    [clientId, userId],
  )
  return rows.length > 0
}

export async function createClient(input: CreateClientInput, userId: string): Promise<Client> {
  const year = new Date().getFullYear()
  const pgClient = await db.connect()
  try {
    await pgClient.query('BEGIN')
    const seq = await nextClientSeq(year, pgClient)
    const clientId = generateClientId(year, seq)
    const { rows } = await pgClient.query(
      `INSERT INTO clients (
        client_id, client_type, full_name, id_number, contact_person,
        phone, email, postal_address, kra_pin,
        has_conflict, conflict_notes, internal_notes,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
      RETURNING *`,
      [
        clientId, input.clientType, input.fullName,
        input.idNumber ?? null, input.contactPerson ?? null,
        input.phone ?? null, input.email ?? null,
        input.postalAddress ?? null, input.kraPin ?? null,
        input.hasConflict ?? false,
        input.conflictNotes ?? null, input.internalNotes ?? null,
        userId,
      ],
    )
    const created = toClient(rows[0]!)
    await writeAuditLog(
      { userId, action: 'CREATE', recordType: 'client', recordId: created.id, afterValue: created },
      pgClient,
    )
    await pgClient.query('COMMIT')
    return created
  } catch (err) {
    await pgClient.query('ROLLBACK')
    throw err
  } finally {
    pgClient.release()
  }
}

export async function updateClient(
  id: string,
  input: UpdateClientInput,
  userId: string,
): Promise<Client> {
  const pgClient = await db.connect()
  try {
    await pgClient.query('BEGIN')

    const { rows: lockRows } = await pgClient.query(
      'SELECT * FROM clients WHERE id = $1 FOR UPDATE',
      [id],
    )
    if (!lockRows[0]) throw createError('Client not found', 404, 'NOT_FOUND')
    const before = toClient(lockRows[0])

    const fieldMap: Record<string, string> = {
      fullName: 'full_name', idNumber: 'id_number', contactPerson: 'contact_person',
      phone: 'phone', email: 'email', postalAddress: 'postal_address',
      kraPin: 'kra_pin', hasConflict: 'has_conflict',
      conflictNotes: 'conflict_notes', internalNotes: 'internal_notes', status: 'status',
    }

    const setClauses: string[] = []
    const vals: unknown[] = []
    let i = 1

    for (const [jsKey, col] of Object.entries(fieldMap)) {
      if (jsKey in input) {
        setClauses.push(`${col} = $${i}`)
        const v = input[jsKey as keyof UpdateClientInput]
        vals.push(v !== undefined ? v : null)
        i++
      }
    }

    if (setClauses.length === 0) {
      await pgClient.query('ROLLBACK')
      return before
    }

    setClauses.push(`updated_by = $${i}`, `updated_at = now()`)
    vals.push(userId)
    i++
    vals.push(id)

    const { rows } = await pgClient.query(
      `UPDATE clients SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      vals,
    )
    const after = toClient(rows[0]!)

    await writeAuditLog(
      { userId, action: 'UPDATE', recordType: 'client', recordId: after.id, beforeValue: before, afterValue: after },
      pgClient,
    )
    await pgClient.query('COMMIT')
    return after
  } catch (err) {
    await pgClient.query('ROLLBACK')
    throw err
  } finally {
    pgClient.release()
  }
}
