function decodeCssForInspection(css: string): string {
  // Strip CSS comments first (e.g. `u/*x*/rl(` or `@im/*x*/port`)
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  // Decode CSS hex escapes (`\75 rl` -> `url`) and single-char escapes (`\u` -> `u`)
  return withoutComments
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16)
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return ''
      return String.fromCodePoint(codePoint)
    })
    .replace(/\\([^\n\r\f])/g, '$1')
}

/**
 * Very small and conservative CSS sanitizer for user-provided CSS.
 *
 * Notes:
 * - This is NOT a full CSS sanitizer. It's a guardrail to reduce obvious risky payloads.
 * - We decode CSS comments/escapes before checking and reject `@import`, `url(`,
 *   `image-set(`, `cross-fade(`, `expression(`, legacy bindings, and HTML-like tags.
 * - If blocked, returns empty string (disables custom css).
 */
export function sanitizeUserCss(raw: string, opts?: { maxLength?: number }): string {
  const maxLength = opts?.maxLength ?? 8000
  const css = (raw ?? '').replaceAll('\u0000', '').trim()
  if (!css) return ''
  if (css.length > maxLength) return ''

  // Reject unclosed CSS comments which could hide trailing constructs.
  if (css.replace(/\/\*[\s\S]*?\*\//g, '').includes('/*')) return ''

  const lowered = css.toLowerCase()
  const decoded = decodeCssForInspection(css).toLowerCase()

  for (const candidate of [lowered, decoded]) {
    if (/@import\b/i.test(candidate)) return ''
    if (/\b(?:url|image-set|cross-fade|expression)\s*\(/i.test(candidate)) return ''
    if (candidate.includes('-moz-binding') || candidate.includes('behavior:')) return ''

    // Prevent injecting HTML tags inside <style>
    if (
      candidate.includes('</style') ||
      candidate.includes('<script') ||
      candidate.includes('</script')
    ) {
      return ''
    }
    if (candidate.includes('<') || candidate.includes('>')) return ''
  }

  return css
}
