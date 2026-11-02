import { homedir } from 'node:os'

/** Longest provider detail the renderer is sent: one or two lines of the failed bubble. */
export const PROVIDER_DETAIL_MAX_CHARS = 300

const REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bsk-[\w-]{6,}/g, 'sk-…'],
  [/\b(bearer)\s+[\w.~+/=-]{8,}/gi, '$1 …'],
  [
    /\b([\w-]*?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization))(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi,
    '$1$2…'
  ],
  // Any other long unbroken run of key-like characters.
  [/[\w+/-]{32,}={0,2}/g, '…']
]

/**
 * A provider's words made fit to show: one line, credential-shaped runs and the home directory
 * masked, cut to {@link PROVIDER_DETAIL_MAX_CHARS}.
 */
export function redactProviderDetail(text: string, home = homedir()): string {
  let out = text.replace(/\s+/g, ' ').trim()
  if (home && home.length > 1) out = out.split(home).join('~')
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement)
  const chars = [...out]
  return chars.length > PROVIDER_DETAIL_MAX_CHARS
    ? `${chars.slice(0, PROVIDER_DETAIL_MAX_CHARS - 1).join('')}…`
    : out
}
