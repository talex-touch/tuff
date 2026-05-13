import type { ClipboardActionErrorCode } from '@talex-touch/utils/transport/events/types'

export const MACOS_AUTOMATION_PERMISSION_MESSAGE =
  '自动粘贴失败：需要在“系统设置 -> 隐私与安全性 -> 自动化”中允许 Tuff 控制 System Events。'

export const AUTO_PASTE_FAILED_MESSAGE =
  '已写入剪贴板，但自动粘贴失败。请确认目标应用仍在前台，或手动按 Cmd/Ctrl+V。'

export interface ClipboardApplyDiagnosticsPayload {
  item?: {
    id?: number
    type?: 'text' | 'image' | 'files'
    content?: string | null
    rawContent?: string | null
  }
  text?: string
  html?: string | null
  type?: 'text' | 'image' | 'files'
  files?: string[]
  delayMs?: number
  hideCoreBox?: boolean
}

export class ClipboardActionRuntimeError extends Error {
  constructor(
    readonly code: ClipboardActionErrorCode,
    message: string,
    readonly originalError?: unknown
  ) {
    super(message)
    this.name = 'ClipboardActionRuntimeError'
  }
}

function getErrorDiagnosticsText(error: unknown): string {
  const parts: string[] = []

  if (error instanceof Error) {
    parts.push(error.message)
  } else if (error !== undefined && error !== null) {
    parts.push(String(error))
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    for (const key of ['stderr', 'stdout', 'code']) {
      const value = record[key]
      if (typeof value === 'string' || typeof value === 'number') {
        parts.push(String(value))
      }
    }
  }

  return parts.join('\n')
}

function isMacOsAutomationPermissionError(error: unknown): boolean {
  const diagnostics = getErrorDiagnosticsText(error)
  return (
    diagnostics.includes('-1743') ||
    (diagnostics.includes('System Events') &&
      (diagnostics.includes('未获得授权') || diagnostics.toLowerCase().includes('not authorized')))
  )
}

function parseFileList(content?: string | null): string[] {
  if (!content) return []
  try {
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
  } catch {
    return []
  }
}

export function normalizeClipboardActionError(
  error: unknown,
  fallbackMessage?: string
): { code: ClipboardActionErrorCode; message: string; originalError: unknown } {
  if (error instanceof ClipboardActionRuntimeError) {
    return { code: error.code, message: error.message, originalError: error.originalError ?? error }
  }

  if (isMacOsAutomationPermissionError(error)) {
    return {
      code: 'MACOS_AUTOMATION_PERMISSION_DENIED',
      message: MACOS_AUTOMATION_PERMISSION_MESSAGE,
      originalError: error
    }
  }

  const message = error instanceof Error ? error.message : String(error || '')
  return {
    code: 'AUTO_PASTE_FAILED',
    message: fallbackMessage || message || AUTO_PASTE_FAILED_MESSAGE,
    originalError: error
  }
}

export function summarizeClipboardApplyPayload(
  payload?: ClipboardApplyDiagnosticsPayload | null,
  platform = process.platform
): Record<string, unknown> {
  const item = payload?.item
  const type = payload?.type ?? item?.type ?? (payload?.files ? 'files' : undefined)
  const text = payload?.text ?? (type === 'text' ? item?.content : undefined)
  const html = payload?.html ?? (type === 'text' ? item?.rawContent : undefined)
  const image = type === 'image' ? (item?.content ?? payload?.text) : undefined
  const files = payload?.files ?? (type === 'files' ? parseFileList(item?.content) : [])
  const delayMs = Number.isFinite(payload?.delayMs) ? Math.max(0, Number(payload?.delayMs)) : 150

  return {
    platform,
    itemId: Number.isFinite(item?.id) ? item?.id : undefined,
    type: type ?? 'unknown',
    textLength: typeof text === 'string' ? text.length : undefined,
    hasHtml: typeof html === 'string' ? html.length > 0 : undefined,
    imageLength: typeof image === 'string' ? image.length : undefined,
    fileCount: files.length,
    hideCoreBox: payload?.hideCoreBox !== false,
    delayMs
  }
}
