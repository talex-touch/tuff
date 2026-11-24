export const BROWSER_FILE_PREVIEW_ORIGIN = 'tuff://preview'

export interface BrowserFilePreviewTarget {
  path: string
  conversationId?: string
  line?: number
}

export function buildBrowserFilePreviewUrl(target: BrowserFilePreviewTarget): string {
  const params = new URLSearchParams()
  params.set('path', target.path)
  if (target.conversationId) params.set('conversationId', target.conversationId)
  if (typeof target.line === 'number' && Number.isFinite(target.line) && target.line > 0) {
    params.set('line', String(Math.trunc(target.line)))
  }
  return `${BROWSER_FILE_PREVIEW_ORIGIN}?${params.toString()}`
}

export function parseBrowserFilePreviewUrl(
  url: string | null | undefined
): BrowserFilePreviewTarget | null {
  if (!url || !url.startsWith(BROWSER_FILE_PREVIEW_ORIGIN)) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'tuff:' || parsed.hostname !== 'preview') return null
    const filePath = parsed.searchParams.get('path')?.trim()
    if (!filePath) return null
    const conversationId = parsed.searchParams.get('conversationId')?.trim() || undefined
    const rawLine = parsed.searchParams.get('line')
    const parsedLine = rawLine ? Number.parseInt(rawLine, 10) : NaN
    const line = Number.isFinite(parsedLine) && parsedLine > 0 ? parsedLine : undefined
    return {
      path: filePath,
      ...(conversationId ? { conversationId } : {}),
      ...(line !== undefined ? { line } : {})
    }
  } catch {
    return null
  }
}

export function basenameOfPath(filePath: string): string {
  const trimmed = filePath.replace(/[/\\]+$/, '')
  if (!trimmed) return filePath
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return cut >= 0 ? trimmed.slice(cut + 1) || trimmed : trimmed
}
