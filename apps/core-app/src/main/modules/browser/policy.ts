import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { BrowserViewportRequest } from '@talex-touch/utils/transport/sdk/domains/browser'
import type { BrowserWindow, Rectangle } from 'electron'

export const MAX_BROWSER_TABS = 16
export const MAX_BROWSER_RECENT = 60
export const MAX_BROWSER_BOOKMARKS = 100
const MAX_INPUT_LENGTH = 8192

function hasUnsafeBrowserCharacters(value: string, allowSpaces: boolean): boolean {
  const minimum = allowSpaces ? 32 : 33
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < minimum || code === 127 || code === 92) return true
  }
  return false
}

export function isRemoteWebUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    const protocol = new URL(value).protocol
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Navigation policy for untrusted guest webviews.
 *
 * Guest pages (links, redirects, subframes, window.open) may only navigate to credential-free
 * remote HTTP(S) origins — never internal `tuff://` app surfaces, which are reserved strictly for
 * host-initiated `createTab` / `navigate` calls.
 */
export function isAllowedGuestNavigationUrl(value: unknown): value is string {
  return isAllowedBrowserUrl(value) && isRemoteWebUrl(value)
}

export function isAllowedBrowserUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > MAX_INPUT_LENGTH ||
    hasUnsafeBrowserCharacters(value, false)
  )
    return false
  try {
    const url = new URL(value)
    if (url.protocol === 'tuff:') {
      return Boolean(url.hostname)
    }
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

export function normalizeBrowserInput(input: unknown): string {
  if (
    typeof input !== 'string' ||
    input.length > MAX_INPUT_LENGTH ||
    hasUnsafeBrowserCharacters(input, true)
  )
    throw new Error('BROWSER_INPUT_INVALID')
  const value = input.trim()
  if (!value) return ''
  const domain =
    /^(?:localhost|\[[\da-f:]+\]|(?:[\p{L}\d-]+\.)+[\p{L}\d-]+)(?::\d{1,5})?(?:[/?#]|$)/iu.test(
      value
    )
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !domain) {
    if (!isAllowedBrowserUrl(value)) throw new Error('BROWSER_URL_BLOCKED')
    return new URL(value).href
  }
  if (domain && !/\s/.test(value)) {
    const url = `https://${value}`
    if (!isAllowedBrowserUrl(url)) throw new Error('BROWSER_URL_BLOCKED')
    return new URL(url).href
  }
  if (value.startsWith('//') || /^[^\s/]+@[^\s/]+/.test(value))
    throw new Error('BROWSER_URL_BLOCKED')
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`
}

export function clampBrowserViewport(
  request: BrowserViewportRequest,
  content: { width: number; height: number }
): Rectangle | null {
  const bounds = request?.bounds
  if (
    typeof request?.visible !== 'boolean' ||
    !bounds ||
    ![bounds.x, bounds.y, bounds.width, bounds.height, content.width, content.height].every(
      Number.isFinite
    )
  )
    throw new Error('BROWSER_VIEWPORT_INVALID')
  if (!request.visible || bounds.width <= 0 || bounds.height <= 0) return null
  const x = Math.min(Math.max(0, Math.ceil(bounds.x)), content.width)
  const y = Math.min(Math.max(0, Math.ceil(bounds.y)), content.height)
  const right = Math.max(x, Math.min(content.width, Math.floor(bounds.x + bounds.width)))
  const bottom = Math.max(y, Math.min(content.height, Math.floor(bounds.y + bounds.height)))
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

export function assertBrowserOwner(context: HandlerContext, owner: BrowserWindow): void {
  const frame = context.senderFrame
  if (
    owner.isDestroyed() ||
    owner.webContents.isDestroyed() ||
    context.plugin ||
    context.sender !== owner.webContents ||
    !frame ||
    frame !== owner.webContents.mainFrame ||
    frame.parent ||
    frame.detached ||
    frame.isDestroyed()
  )
    throw new Error('BROWSER_HOST_ONLY')
}
