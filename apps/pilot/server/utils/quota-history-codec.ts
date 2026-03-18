import {
  extractLatestPilotUserMessage,
  extractLatestPilotUserTurn,
} from '@talex-touch/tuff-intelligence/pilot'

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

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const text = String(raw || '').trim()
  if (!text) {
    return null
  }

  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  }
  catch {
    return null
  }
}

function decodeLegacyText(value: string): string | null {
  try {
    return decodeURIComponent(atob(value))
  }
  catch {
    return null
  }
}

export function decodeQuotaConversation(value: string): Record<string, unknown> | null {
  return parseJsonObject(value)
}

export function decodeLegacyQuotaConversation(value: string): Record<string, unknown> | null {
  const raw = String(value || '').trim()
  if (!raw) {
    return null
  }

  const decoded = decodeLegacyText(raw)
  if (!decoded) {
    return null
  }

  return parseJsonObject(decoded)
}

export function extractLatestQuotaUserTurn(messages: unknown): QuotaUserTurn {
  const turn = extractLatestPilotUserTurn(messages)
  return {
    text: turn.text,
    attachments: turn.attachments.map(item => ({
      type: item.type,
      value: item.value,
      name: item.name,
      data: item.data,
    })),
  }
}

export function extractLatestQuotaUserMessage(messages: unknown): string {
  return extractLatestPilotUserMessage(messages)
}
