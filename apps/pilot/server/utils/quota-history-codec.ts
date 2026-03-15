export interface QuotaChatMessageLike {
  role?: string
  content?: unknown
}

export interface QuotaUserTurnAttachment {
  type: 'image' | 'file'
  value: string
  name?: string
  data?: string
}

export interface QuotaUserTurn {
  text: string
  attachments: QuotaUserTurnAttachment[]
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

function normalizeInnerMetaList(content: unknown): Array<{
  type: string
  value: string
  name?: string
  data?: string
}> {
  if (typeof content === 'string') {
    return [{
      type: 'text',
      value: content,
    }]
  }

  if (!Array.isArray(content)) {
    return []
  }

  const list: Array<{
    type: string
    value: string
    name?: string
    data?: string
  }> = []

  for (const item of content) {
    if (typeof item === 'string') {
      list.push({
        type: 'text',
        value: item,
      })
      continue
    }

    if (!item || typeof item !== 'object') {
      continue
    }

    const row = item as Record<string, unknown>
    const value = typeof row.value === 'string' ? row.value : ''
    if (!value) {
      continue
    }

    list.push({
      type: typeof row.type === 'string' ? row.type : 'text',
      value,
      name: typeof row.name === 'string' ? row.name : undefined,
      data: typeof row.data === 'string' ? row.data : undefined,
    })
  }

  return list
}

function parseQuotaUserTurn(content: unknown): QuotaUserTurn {
  const blocks = normalizeInnerMetaList(content)
  if (blocks.length <= 0) {
    return {
      text: '',
      attachments: [],
    }
  }

  const textList: string[] = []
  const attachments: QuotaUserTurnAttachment[] = []

  for (const block of blocks) {
    const type = String(block.type || '').toLowerCase()
    const value = String(block.value || '').trim()
    if (!value) {
      continue
    }

    if (type === 'image' || type === 'file') {
      attachments.push({
        type,
        value,
        name: block.name,
        data: block.data,
      })
      continue
    }

    textList.push(value)
  }

  return {
    text: textList.join('\n').trim(),
    attachments,
  }
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

export function extractLatestQuotaUserTurn(messages: unknown): QuotaUserTurn {
  if (!Array.isArray(messages)) {
    return {
      text: '',
      attachments: [],
    }
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index] as QuotaChatMessageLike
    if (String(item?.role || '').toLowerCase() !== 'user') {
      continue
    }

    const turn = parseQuotaUserTurn(item?.content)
    if (turn.text || turn.attachments.length > 0) {
      return turn
    }
  }

  return {
    text: '',
    attachments: [],
  }
}

export function extractLatestQuotaUserMessage(messages: unknown): string {
  const turn = extractLatestQuotaUserTurn(messages)
  if (turn.text) {
    return turn.text
  }

  if (turn.attachments.length <= 0) {
    return ''
  }

  const fallback = stringifyUnknown(
    turn.attachments.map(item => item.value),
  ).trim()

  return fallback
}
