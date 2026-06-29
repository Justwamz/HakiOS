import type { CaseNumberSettings } from '@hakios/types'

export function generateClientId(year: number, seq: number): string {
  return `CLT-${year}-${String(seq).padStart(5, '0')}`
}

export function generateMatterNumber(
  settings: CaseNumberSettings,
  matterTypeCode: string,
  year: number,
  seq: number,
): string {
  const { firmPrefix, includeTypeCode, includeYear, sequenceDigits, separator } = settings
  const parts: string[] = [firmPrefix]
  if (includeTypeCode) parts.push(matterTypeCode)
  if (includeYear) parts.push(String(year))
  parts.push(String(seq).padStart(sequenceDigits, '0'))
  return parts.join(separator)
}
