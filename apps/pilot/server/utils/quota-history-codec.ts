export interface QuotaChatMessageLike {
  role?: string
  content?: unknown
}

function decodeText(value: string): string {
  return decodeURIComponent(atob(value))
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (!Array.isArray(value)) {
    return ''
  }

  const chunks = value
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }
      if (item && typeof item === 'object' && typeof (item as { value?: unknown }).value === 'string') {
        return String((item as { value?: string }).value)
      }
      return ''
    })
    .filter(Boolean)

  return chunks.join('\n')
}

export function decodeQuotaConversation(value: string): Record<string, unknown> | null {
  const raw = String(value || '').trim()
  if (!raw) {
    return null
  }

  try {
    const decoded = decodeText(raw)
    const parsed = JSON.parse(decoded)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  }
  catch {
    return null
  }
}

export function extractLatestQuotaUserMessage(messages: unknown): string {
  if (!Array.isArray(messages)) {
    return ''
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index] as QuotaChatMessageLike
    if (String(item?.role || '').toLowerCase() !== 'user') {
      continue
    }
    const text = stringifyUnknown(item?.content).trim()
    if (text) {
      return text
    }
  }

  return ''
}
