export function formatDateTime(value: string | number | null | undefined, locale = 'en'): string {
  if (value === null || value === undefined || value === '')
    return '—'
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime()))
    return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatNumber(value: number | null | undefined, locale = 'en'): string {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num))
    return '0'
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US').format(num)
}

export function formatBytes(bytes: number | null | undefined): string {
  const value = Number(bytes ?? 0)
  if (!Number.isFinite(value) || value <= 0)
    return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let idx = 0
  let current = value
  while (current >= 1024 && idx < units.length - 1) {
    current /= 1024
    idx += 1
  }
  return `${current >= 100 || idx === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[idx]}`
}

export function resolveLocalizedText(
  value: string | { en?: string, zh?: string } | null | undefined,
  locale = 'en',
): string {
  if (!value)
    return ''
  if (typeof value === 'string')
    return value
  return locale === 'zh'
    ? (value.zh || value.en || '')
    : (value.en || value.zh || '')
}

export function formatPercent(value: number | null | undefined): string {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num))
    return '0%'
  const normalized = num <= 1 && num >= 0 ? num * 100 : num
  return `${normalized.toFixed(1)}%`
}
