function decodeCssForInspection(css: string): string {
  // CSS Syntax L3 preprocessing: remove NULs and normalize CRLF/CR/FF to LF before escape decoding.
  const normalized = css.replaceAll('\u0000', '').replace(/\r\n?|\f/g, '\n')
  // Replace CSS comments with a NUL delimiter so hex escapes cannot merge across comment boundaries
  // (e.g. `cross-\66/*c*/ade` stays `cross-\66\0ade` -> `cross-f\0ade` -> `cross-fade`).
  const withDelimiters = normalized.replace(/\/\*[\s\S]*?\*\//g, '\u0000')
  // Decode CSS hex escapes (`\75\nrl` or `\75 rl` -> `url`) and single-char escapes (`\u` -> `u`),
  // then drop the NUL comment delimiters.
  return withDelimiters
    .replace(/\\([0-9a-fA-F]{1,6})[ \t\n]?/g, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16)
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return ''
      return String.fromCodePoint(codePoint)
    })
    .replace(/\\([^\n])/g, '$1')
    .replaceAll('\u0000', '')
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
