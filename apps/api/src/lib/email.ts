import { Resend } from 'resend'
import {
  renderInviteEmail,
  renderResetEmail,
  renderReminderEmail,
  renderEscalationEmail,
} from '@hakios/email'
import type {
  ReminderEmailProps,
  EscalationEmailProps,
} from '@hakios/email'

function getResend(): Resend {
  const key = process.env['RESEND_API_KEY']
  if (!key) throw new Error('RESEND_API_KEY environment variable is required')
  return new Resend(key)
}

function getFromAddress(): string {
  return process.env['EMAIL_FROM'] ?? 'HakiOS <noreply@hakios.app>'
}

export async function sendInviteEmail(opts: {
  to: string
  firstName: string
  firmName: string
  setupUrl: string
  expiresInHours: number
}): Promise<void> {
  const html = await renderInviteEmail({
    firstName: opts.firstName,
    firmName: opts.firmName,
    setupUrl: opts.setupUrl,
    expiresInHours: opts.expiresInHours,
  })
  await getResend().emails.send({
    from: getFromAddress(),
    to: opts.to,
    subject: `You've been invited to ${opts.firmName} on HakiOS`,
    html,
  })
}

export async function sendResetEmail(opts: {
  to: string
  firstName: string
  firmName: string
  resetUrl: string
}): Promise<void> {
  const html = await renderResetEmail({
    firstName: opts.firstName,
    firmName: opts.firmName,
    resetUrl: opts.resetUrl,
  })
  await getResend().emails.send({
    from: getFromAddress(),
    to: opts.to,
    subject: 'Reset your HakiOS password',
    html,
  })
}

export async function sendReminderEmail(
  to: string,
  props: ReminderEmailProps,
): Promise<void> {
  const html = await renderReminderEmail(props)
  await getResend().emails.send({
    from: getFromAddress(),
    to,
    subject: `Reminder: ${props.eventType.replace(/_/g, ' ')} — ${props.matterName}`,
    html,
  })
}

export async function sendEscalationEmail(
  to: string,
  props: EscalationEmailProps,
): Promise<void> {
  const html = await renderEscalationEmail(props)
  await getResend().emails.send({
    from: getFromAddress(),
    to,
    subject: `[ESCALATION] Unacknowledged event — ${props.matterName}`,
    html,
  })
}
