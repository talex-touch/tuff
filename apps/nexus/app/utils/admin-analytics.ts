export function formatAnalyticsNumber(value: number): string {
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000)
    return `${(value / 1_000).toFixed(1)}K`
  return value.toString()
}

export function toSortedAnalyticsList(source: Record<string, number> | undefined, limit = 6): Array<[string, number]> {
  return Object.entries(source ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
}

export function formatAnalyticsCategoryLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map(part => part[0] ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ')
}

export function formatAnalyticsCategoryKey(key: string): { level1: string, level2: string } {
  const [level1, level2] = key.split(':')
  return {
    level1: formatAnalyticsCategoryLabel(level1 || 'others'),
    level2: formatAnalyticsCategoryLabel(level2 || 'others'),
  }
}

export function formatAnalyticsDateTime(value: string | number | null | undefined, locale: string, fallback = '-'): string {
  if (value == null || value === '')
    return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(locale)
}

export function formatExchangeRate(value: number): string {
  if (!Number.isFinite(value))
    return '-'
  return value >= 1 ? value.toFixed(4) : value.toFixed(6)
}

export function formatPayloadPreview(payload?: Record<string, unknown>): string {
  if (!payload)
    return ''
  const raw = JSON.stringify(payload)
  return raw.length > 180 ? `${raw.slice(0, 180)}...` : raw
}

export function formatAnalyticsDuration(milliseconds: number): string {
  if (!milliseconds)
    return '0s'
  const totalSeconds = Math.floor(milliseconds / 1000)
  if (totalSeconds < 60)
    return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  return `${minutes}m ${totalSeconds % 60}s`
}
