/**
 * Very small and conservative CSS sanitizer for user-provided CSS.
 *
 * Notes:
 * - This is NOT a full CSS sanitizer. It's a guardrail to reduce obvious risky payloads.
 * - We intentionally block `@import`, `url(`, and HTML-like tags.
 * - If blocked, returns empty string (disables custom css).
 */
export function sanitizeUserCss(raw: string, opts?: { maxLength?: number }): string {
  const maxLength = opts?.maxLength ?? 8000
  const css = (raw ?? '').replaceAll('\u0000', '').trim()
  if (!css) return ''
  if (css.length > maxLength) return ''

  const lowered = css.toLowerCase()
  if (lowered.includes('@import')) return ''
  if (lowered.includes('url(')) return ''
  if (lowered.includes('expression(')) return ''

  // Prevent injecting HTML tags inside <style>
  if (lowered.includes('</style') || lowered.includes('<script') || lowered.includes('</script')) {
    return ''
  }
  if (lowered.includes('<') || lowered.includes('>')) return ''

  return css
}
