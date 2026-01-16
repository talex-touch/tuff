export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0)
    return '0'
  if (value < 1000)
    return String(value)
  if (value < 1_000_000)
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`
}

export function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0)
    return '0B'
  const kb = 1024
  const mb = kb * 1024
  const gb = mb * 1024
  if (bytes >= gb)
    return `${(bytes / gb).toFixed(1)}GB`
  if (bytes >= mb)
    return `${(bytes / mb).toFixed(0)}MB`
  if (bytes >= kb)
    return `${(bytes / kb).toFixed(0)}KB`
  return `${Math.floor(bytes)}B`
}

export function formatUptimeShort(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0)
    return '0s'
  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const hour = Math.floor(min / 60)
  const day = Math.floor(hour / 24)
  if (day > 0)
    return `${day}d`
  if (hour > 0)
    return `${hour}h`
  if (min > 0)
    return `${min}m`
  return `${sec}s`
}

