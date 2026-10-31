import type { ClipboardActionErrorCode } from '@talex-touch/utils/transport/events/types'
import { t } from '../../utils/i18n-helper'

/*
 * Read when the failure happens, in the interface's language: these messages reach the CoreBox
 * footer and the OS notification as they are written.
 */

export function macosAutomationPermissionMessage(): string {
  return t('clipboardActions.automationPermissionDenied')
}

export function macosAccessibilityPermissionMessage(): string {
  return t('clipboardActions.accessibilityPermissionDenied')
}

export function autoPasteFailedMessage(): string {
  return t('clipboardActions.autoPasteFailed')
}

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

function isMacOsAccessibilityPermissionError(error: unknown): boolean {
  const diagnostics = getErrorDiagnosticsText(error).toLowerCase()
  return (
    diagnostics.includes('not allowed to send keystrokes') ||
    (diagnostics.includes('system events') && diagnostics.includes('(1002)'))
  )
}

function isMacOsAutomationPermissionError(error: unknown): boolean {
  const diagnostics = getErrorDiagnosticsText(error)
  const normalizedDiagnostics = diagnostics.toLowerCase()
  return (
    diagnostics.includes('-1743') ||
    (normalizedDiagnostics.includes('system events') &&
      (diagnostics.includes('未获得授权') || normalizedDiagnostics.includes('not authorized')))
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

  if (isMacOsAccessibilityPermissionError(error)) {
    return {
      code: 'MACOS_ACCESSIBILITY_PERMISSION_DENIED',
      message: macosAccessibilityPermissionMessage(),
      originalError: error
    }
  }

  if (isMacOsAutomationPermissionError(error)) {
    return {
      code: 'MACOS_AUTOMATION_PERMISSION_DENIED',
      message: macosAutomationPermissionMessage(),
      originalError: error
    }
  }

  const message = error instanceof Error ? error.message : String(error || '')
  return {
    code: 'AUTO_PASTE_FAILED',
    message: fallbackMessage || message || autoPasteFailedMessage(),
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
