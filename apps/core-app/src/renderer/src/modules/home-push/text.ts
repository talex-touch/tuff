/**
 * Clips `value` to at most `max` code points, the last one an ellipsis when anything was cut.
 *
 * Code points rather than UTF-16 units, so an emoji or a rare CJK character is never split into a
 * lone surrogate that renders as a replacement glyph.
 */
export function clipText(value: string, max: number): string {
  const points = [...value]
  if (points.length <= max) return value
  return `${points
    .slice(0, Math.max(0, max - 1))
    .join('')
    .trimEnd()}…`
}

/** One line of display text: every whitespace run, newlines included, becomes a single space. */
export function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
