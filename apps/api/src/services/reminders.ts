import { db } from '../db/client.js'
import { createNotification } from './notifications.js'

function addDaysToDate(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export async function runReminders(): Promise<{ reminders: number; overdue: number }> {
  const today = new Date().toISOString().slice(0, 10)
  let reminders = 0
  let overdue = 0

  // ── Reminder notifications ─────────────────────────────────────────────────
  const { rows: schedules } = await db.query(
    'SELECT event_type, days_before FROM reminder_schedules',
  )

  for (const schedule of schedules) {
    const daysBefore = schedule['days_before'] as number
    const eventType = schedule['event_type'] as string
    const targetDate = addDaysToDate(today, daysBefore)

    const { rows: events } = await db.query(
      `SELECT ce.id, ce.title, ce.matter_id
       FROM calendar_events ce
       WHERE ce.date = $1 AND ce.is_resolved = false AND ce.event_type = $2`,
      [targetDate, eventType],
    )

    for (const event of events) {
      const { rows: assignees } = await db.query(
        'SELECT user_id FROM event_assignees WHERE event_id = $1',
        [event['id']],
      )

      for (const assignee of assignees) {
        const { rows: existing } = await db.query(
          `SELECT 1 FROM notifications
           WHERE user_id = $1 AND event_id = $2 AND type = 'reminder'
             AND created_at > now() - interval '25 hours'`,
          [assignee['user_id'], event['id']],
        )
        if (existing.length > 0) continue

        await createNotification({
          userId: assignee['user_id'] as string,
          type: 'reminder',
          title: `Reminder: ${event['title'] as string}`,
          body: `This event is due in ${daysBefore} day(s)`,
          matterId: event['matter_id'] as string,
          eventId: event['id'] as string,
        })
        reminders++
      }
    }
  }

  // ── Overdue notifications ──────────────────────────────────────────────────
  const { rows: overdueEvents } = await db.query(
    `SELECT ce.id, ce.title, ce.matter_id
     FROM calendar_events ce
     WHERE ce.date < $1 AND ce.is_resolved = false`,
    [today],
  )

  for (const event of overdueEvents) {
    const { rows: assignees } = await db.query(
      'SELECT user_id FROM event_assignees WHERE event_id = $1',
      [event['id']],
    )

    for (const assignee of assignees) {
      const { rows: existing } = await db.query(
        `SELECT 1 FROM notifications
         WHERE user_id = $1 AND event_id = $2 AND type = 'overdue'
           AND created_at > now() - interval '25 hours'`,
        [assignee['user_id'], event['id']],
      )
      if (existing.length > 0) continue

      await createNotification({
        userId: assignee['user_id'] as string,
        type: 'overdue',
        title: `Overdue: ${event['title'] as string}`,
        body: 'This event is past its due date and has not been resolved',
        matterId: event['matter_id'] as string,
        eventId: event['id'] as string,
      })
      overdue++
    }
  }

  return { reminders, overdue }
}
