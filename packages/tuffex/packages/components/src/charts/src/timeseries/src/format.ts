const compactTimestamp = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** Default tooltip timestamp format: compact, locale-aware, 24h. */
export function formatTimestamp(ts: number): string {
  return compactTimestamp.format(new Date(ts))
}
