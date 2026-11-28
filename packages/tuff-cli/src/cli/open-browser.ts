import { spawn } from 'node:child_process'
import process from 'node:process'

const UNSAFE_BROWSER_URL_CHAR_RE = /[\s"'<>`\\]/

function hasUnsafeBrowserUrlChars(value: string): boolean {
  if (UNSAFE_BROWSER_URL_CHAR_RE.test(value))
    return true
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1F || code === 0x7F)
      return true
  }
  return false
}

export interface OpenBrowserInvocation {
  command: string
  args: string[]
}

/**
 * Validates that a browser URL is a well-formed `http:` or `https:` URL with no
 * control characters, whitespace, quotes, or shell-breaking tokens.
 */
export function validateBrowserUrl(rawUrl: string): string {
  if (typeof rawUrl !== 'string')
    throw new Error('Invalid browser URL: expected a string.')

  const trimmed = rawUrl.trim()
  if (!trimmed || hasUnsafeBrowserUrlChars(trimmed))
    throw new Error('Invalid browser URL: contains disallowed characters.')

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  }
  catch {
    throw new Error('Invalid browser URL: malformed URL.')
  }

  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !parsed.hostname)
    throw new Error(`Disallowed browser URL protocol: ${parsed.protocol}`)

  const normalized = parsed.toString()
  if (hasUnsafeBrowserUrlChars(normalized))
    throw new Error('Invalid browser URL: normalized URL contains disallowed characters.')

  return normalized
}

/**
 * Resolves a platform-specific browser launch invocation without invoking `cmd.exe`
 * or any shell interpreter (always executed with `shell: false`).
 */
export function resolveOpenBrowserInvocation(
  rawUrl: string,
  platform: NodeJS.Platform = process.platform,
): OpenBrowserInvocation {
  const url = validateBrowserUrl(rawUrl)
  if (platform === 'darwin')
    return { command: 'open', args: [url] }
  if (platform === 'win32')
    return { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url] }
  return { command: 'xdg-open', args: [url] }
}

/**
 * Opens an `http(s):` URL in the default browser without shell interpretation.
 * Returns `false` if the URL fails validation or launching fails.
 */
export function openBrowser(
  rawUrl: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  let invocation: OpenBrowserInvocation
  try {
    invocation = resolveOpenBrowserInvocation(rawUrl, platform)
  }
  catch {
    return false
  }

  try {
    const child = spawn(invocation.command, invocation.args, {
      stdio: 'ignore',
      detached: true,
      shell: false,
    })
    child.unref()
    return true
  }
  catch {
    return false
  }
}
