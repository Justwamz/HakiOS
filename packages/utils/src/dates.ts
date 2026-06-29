export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function daysBefore(date: Date, n: number): Date {
  return addDays(date, -n)
}

export function toDateString(date: Date): string {
  return date.toISOString().split('T')[0] as string
}

export function toEAT(date: Date): Date {
  // EAT = UTC+3; returns a new Date adjusted for display
  return new Date(date.getTime() + 3 * 60 * 60 * 1000)
}

export function formatEAT(date: Date): string {
  return date.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })
}

export function currentYear(): number {
  return new Date().getUTCFullYear()
}
