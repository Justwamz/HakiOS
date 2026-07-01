import { db } from '../db/client.js'
import type { PoolClient } from 'pg'
import type {
  CalendarEvent,
  CreateCalendarEventInput,
  EventType,
  RecurrenceType,
  UpdateCalendarEventInput,
} from '@hakios/types'

const EVENT_SELECT = `
  SELECT
    ce.id, ce.event_type, ce.title, ce.matter_id, ce.date, ce.time,
    ce.supervising_partner_id, ce.notes, ce.recurrence, ce.recurrence_parent_id,
    ce.is_resolved, ce.acknowledged_at, ce.created_by, ce.created_at, ce.updated_at,
    m.client_id, m.matter_number,
    COALESCE(ARRAY_AGG(DISTINCT ea.user_id) FILTER (WHERE ea.user_id IS NOT NULL), '{}') AS assignee_ids
  FROM calendar_events ce
  JOIN matters m ON m.id = ce.matter_id
  LEFT JOIN event_assignees ea ON ea.event_id = ce.id
`

function toCalendarEvent(row: Record<string, unknown>): CalendarEvent {
  return {
    id: row['id'] as string,
    eventType: row['event_type'] as EventType,
    title: row['title'] as string,
    matterId: row['matter_id'] as string,
    matterNumber: row['matter_number'] as string,
    clientId: row['client_id'] as string,
    date: (row['date'] as Date).toISOString().slice(0, 10),
    time: row['time'] ? (row['time'] as string).slice(0, 5) : null,
    assigneeIds: (row['assignee_ids'] as string[]) ?? [],
    supervisingPartnerId: (row['supervising_partner_id'] as string | null) ?? null,
    notes: (row['notes'] as string | null) ?? null,
    recurrence: (row['recurrence'] as RecurrenceType) ?? 'none',
    recurrenceParentId: (row['recurrence_parent_id'] as string | null) ?? null,
    isResolved: row['is_resolved'] as boolean,
    acknowledgedAt: row['acknowledged_at']
      ? (row['acknowledged_at'] as Date).toISOString()
      : null,
    createdBy: row['created_by'] as string,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  }
}

export interface ListEventsFilter {
  from?: string
  to?: string
  matterId?: string
  eventType?: EventType
  includeResolved?: boolean
  userId?: string   // restrict to events where user is an assignee (for calendar:read_assigned)
}

export async function listEvents(filter: ListEventsFilter): Promise<CalendarEvent[]> {
  const conditions: string[] = []
  const params: unknown[] = []
  let i = 1

  if (filter.from) { conditions.push(`ce.date >= $${i++}`); params.push(filter.from) }
  if (filter.to) { conditions.push(`ce.date <= $${i++}`); params.push(filter.to) }
  if (filter.matterId) { conditions.push(`ce.matter_id = $${i++}`); params.push(filter.matterId) }
  if (filter.eventType) { conditions.push(`ce.event_type = $${i++}`); params.push(filter.eventType) }
  if (!filter.includeResolved) conditions.push(`ce.is_resolved = false`)

  // INNER JOIN on ea2 to filter events by assignee; does not affect the LEFT JOIN ea aggregation
  const assigneeJoin = filter.userId
    ? `JOIN event_assignees ea2 ON ea2.event_id = ce.id AND ea2.user_id = $${i++}`
    : ''
  if (filter.userId) params.push(filter.userId)

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const { rows } = await db.query(
    `${EVENT_SELECT} ${assigneeJoin}
     ${where}
     GROUP BY ce.id, m.client_id, m.matter_number
     ORDER BY ce.date ASC, ce.time ASC NULLS LAST
     LIMIT 500`,
    params,
  )
  return rows.map(toCalendarEvent)
}

export async function getEvent(id: string): Promise<CalendarEvent | null> {
  const { rows } = await db.query(
    `${EVENT_SELECT}
     WHERE ce.id = $1
     GROUP BY ce.id, m.client_id, m.matter_number`,
    [id],
  )
  const row = rows[0]
  if (!row) return null
  return toCalendarEvent(row)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function addMonths(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

async function insertAssignees(pgClient: PoolClient, eventId: string, assigneeIds: string[]): Promise<void> {
  if (assigneeIds.length === 0) return
  await pgClient.query(
    `INSERT INTO event_assignees (event_id, user_id) SELECT $1, UNNEST($2::uuid[])`,
    [eventId, assigneeIds],
  )
}

export async function createEvent(
  input: CreateCalendarEventInput,
  createdBy: string,
): Promise<CalendarEvent> {
  const pgClient = await db.connect()
  let parentId: string | undefined
  try {
    await pgClient.query('BEGIN')
    const { rows } = await pgClient.query<Record<string, unknown>>(
      `INSERT INTO calendar_events
         (event_type, title, matter_id, date, time, supervising_partner_id, notes, recurrence, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.eventType,
        input.title,
        input.matterId,
        input.date,
        input.time ?? null,
        input.supervisingPartnerId ?? null,
        input.notes ?? null,
        input.recurrence ?? 'none',
        createdBy,
      ],
    )
    const row = rows[0]
    if (!row) throw new Error('Insert failed')
    parentId = row['id'] as string

    await insertAssignees(pgClient, parentId, input.assigneeIds ?? [])

    const recurrence = input.recurrence
    if (recurrence === 'weekly' || recurrence === 'monthly') {
      for (let n = 1; n <= 11; n++) {
        const date =
          recurrence === 'weekly' ? addDays(input.date, n * 7) : addMonths(input.date, n)
        const { rows: cr } = await pgClient.query<Record<string, unknown>>(
          `INSERT INTO calendar_events
             (event_type, title, matter_id, date, time, supervising_partner_id,
              notes, recurrence, recurrence_parent_id, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [
            input.eventType,
            input.title,
            input.matterId,
            date,
            input.time ?? null,
            input.supervisingPartnerId ?? null,
            input.notes ?? null,
            recurrence,
            parentId,
            createdBy,
          ],
        )
        const cr0 = cr[0]
        if (cr0) await insertAssignees(pgClient, cr0['id'] as string, input.assigneeIds ?? [])
      }
    }

    await pgClient.query(
      `INSERT INTO matter_timeline (matter_id, event_type, description, created_by)
       VALUES ($1, 'event_linked', $2, $3)`,
      [input.matterId, `Event "${input.title}" linked to matter`, createdBy],
    )

    await pgClient.query('COMMIT')
  } catch (err) {
    await pgClient.query('ROLLBACK')
    throw err
  } finally {
    pgClient.release()
  }

  const created = await getEvent(parentId!)
  if (!created) throw new Error('Event not found after insert')
  return created
}

export async function updateEvent(
  id: string,
  input: UpdateCalendarEventInput,
): Promise<CalendarEvent | null> {
  const setClauses: string[] = ['updated_at = now()']
  const params: unknown[] = []
  let i = 1

  if (input.eventType !== undefined) {
    setClauses.push(`event_type = $${i++}`)
    params.push(input.eventType)
  }
  if (input.title !== undefined) {
    setClauses.push(`title = $${i++}`)
    params.push(input.title)
  }
  if (input.date !== undefined) {
    setClauses.push(`date = $${i++}`)
    params.push(input.date)
  }
  if ('time' in input) {
    setClauses.push(`time = $${i++}`)
    params.push(input.time ?? null)
  }
  if ('supervisingPartnerId' in input) {
    setClauses.push(`supervising_partner_id = $${i++}`)
    params.push(input.supervisingPartnerId ?? null)
  }
  if ('notes' in input) {
    setClauses.push(`notes = $${i++}`)
    params.push(input.notes ?? null)
  }

  const pgClient = await db.connect()
  try {
    await pgClient.query('BEGIN')
    if (setClauses.length > 1) {
      params.push(id)
      await pgClient.query(
        `UPDATE calendar_events SET ${setClauses.join(', ')} WHERE id = $${i}`,
        params,
      )
    }
    if (input.assigneeIds !== undefined) {
      await pgClient.query('DELETE FROM event_assignees WHERE event_id = $1', [id])
      await insertAssignees(pgClient, id, input.assigneeIds)
    }
    await pgClient.query('COMMIT')
  } catch (err) {
    await pgClient.query('ROLLBACK')
    throw err
  } finally {
    pgClient.release()
  }

  return getEvent(id)
}

export async function resolveEvent(id: string): Promise<CalendarEvent | null> {
  await db.query(
    `UPDATE calendar_events
     SET is_resolved = true, acknowledged_at = now(), updated_at = now()
     WHERE id = $1`,
    [id],
  )
  return getEvent(id)
}

export async function deleteEvent(id: string): Promise<boolean> {
  const pgClient = await db.connect()
  try {
    await pgClient.query('BEGIN')
    // Remove notifications for this event and its children
    await pgClient.query(
      `DELETE FROM notifications
       WHERE event_id = $1
          OR event_id IN (SELECT id FROM calendar_events WHERE recurrence_parent_id = $1)`,
      [id],
    )
    // Remove child events (event_assignees cascade automatically)
    await pgClient.query('DELETE FROM calendar_events WHERE recurrence_parent_id = $1', [id])
    // Remove the event itself (event_assignees cascade automatically)
    const { rowCount } = await pgClient.query('DELETE FROM calendar_events WHERE id = $1', [id])
    await pgClient.query('COMMIT')
    return (rowCount ?? 0) > 0
  } catch (err) {
    await pgClient.query('ROLLBACK')
    throw err
  } finally {
    pgClient.release()
  }
}
