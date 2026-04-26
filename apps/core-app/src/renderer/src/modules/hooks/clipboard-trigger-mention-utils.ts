export interface ClipboardTriggerPayload {
  type: string
  data: string
}

export interface ClipboardTriggerMention {
  title: string
  message: string
}

type ClipboardTriggerTranslate = (key: string, params?: Record<string, unknown>) => string

const CLIPBOARD_TEXT_PREVIEW_LIMIT = 160

export function resolveClipboardTriggerMention(
  payload: ClipboardTriggerPayload,
  t: ClipboardTriggerTranslate
): ClipboardTriggerMention | null {
  switch (payload.type) {
    case 'text':
      return {
        title: t('tagSection.copiedText'),
        message: formatClipboardTextPreview(payload.data, t('notifications.clipboardTextEmpty'))
      }
    case 'image':
      return {
        title: t('tagSection.copiedImage'),
        message: t('notifications.clipboardImageBody')
      }
    case 'html':
      return {
        title: t('tagSection.copiedHtml'),
        message: t('notifications.clipboardHtmlBody')
      }
    default:
      return null
  }
}

function formatClipboardTextPreview(value: string, emptyText: string): string {
  const normalized = value.trim().replace(/\r\n?/g, '\n')
  if (!normalized) return emptyText

  const preview =
    normalized.length > CLIPBOARD_TEXT_PREVIEW_LIMIT
      ? `${normalized.slice(0, CLIPBOARD_TEXT_PREVIEW_LIMIT).trimEnd()}...`
      : normalized

  return escapeHtml(preview).replace(/\n/g, '<br />')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
