import type { ZodError } from 'zod'

const FIELD_LABELS: Record<string, string> = {
  email: 'email address',
  password: 'password',
  firstName: 'first name',
  lastName: 'last name',
  fullName: 'name',
  phone: 'phone number',
  refreshToken: 'session',
  token: 'link',
  changeNote: 'change note',
  category: 'category',
  name: 'name',
  description: 'description',
  matterId: 'matter',
  clientId: 'client',
  eventType: 'event type',
  date: 'date',
  time: 'time',
}

export function friendlyZodMessage(error: ZodError): string {
  const issue = error.errors[0]
  if (!issue) return 'Please check what you entered and try again.'

  const fieldKey = issue.path.length > 0 ? String(issue.path[0]) : null
  const field = fieldKey ? FIELD_LABELS[fieldKey] : undefined

  if (issue.code === 'invalid_string' && 'validation' in issue && issue.validation === 'email') {
    return 'Please enter a valid email address.'
  }
  if (issue.code === 'too_small' || issue.code === 'invalid_type') {
    return field ? `Please fill in the ${field}.` : 'Please fill in the required fields.'
  }
  return field ? `Please enter a valid ${field}.` : 'Please check what you entered and try again.'
}
