export function normalizePrompt(data: unknown): string {
  if (!data) return ''
  if (typeof data === 'string') {
    return data.trim()
  }
  if (typeof data === 'object' && data !== null) {
    const rawText = (data as any).text
    if (typeof rawText === 'string') {
      return rawText.trim()
    }
  }
  return ''
}
