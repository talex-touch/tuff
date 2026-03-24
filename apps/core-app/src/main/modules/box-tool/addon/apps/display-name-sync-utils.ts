export function normalizeDisplayName(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export function shouldUpdateDisplayName(
  currentDisplayName: string | null | undefined,
  incomingDisplayName: string | null | undefined
): boolean {
  const normalizedIncoming = normalizeDisplayName(incomingDisplayName)
  if (!normalizedIncoming) return false

  return normalizedIncoming !== normalizeDisplayName(currentDisplayName)
}
