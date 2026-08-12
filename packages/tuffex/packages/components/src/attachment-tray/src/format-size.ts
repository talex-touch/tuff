/** Human file size: B under 1KB, then KB/MB/GB with one decimal. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0)
    return ''
  if (bytes < 1024)
    return `${Math.round(bytes)} B`

  const units = ['KB', 'MB', 'GB'] as const
  let value = bytes
  let unit: string = 'B'
  for (const next of units) {
    if (value < 1024)
      break
    value /= 1024
    unit = next
  }
  return `${value.toFixed(1)} ${unit}`
}
