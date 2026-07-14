export function formatCompactEmail(email: string) {
  const value = email.trim()
  const atIndex = value.lastIndexOf('@')

  if (atIndex <= 0)
    return compactPlainAccountLabel(value)

  const local = value.slice(0, atIndex)
  const domain = value.slice(atIndex + 1)
  const compactLocal = local.length > 5 ? `${local.slice(0, 5)}...` : local
  const compactDomain = compactEmailDomain(domain)

  return `${compactLocal}@${compactDomain}`
}

export function formatCompactAccountLabel(value: string) {
  const normalized = value.trim()
  if (!normalized)
    return ''

  if (normalized.includes('@'))
    return formatCompactEmail(normalized)

  return compactPlainAccountLabel(normalized)
}

function compactPlainAccountLabel(value: string) {
  return value.length > 18 ? `${value.slice(0, 6)}...` : value
}

function compactEmailDomain(domain: string) {
  if (domain.length <= 12)
    return domain

  const labels = domain.split('.').filter(Boolean)
  if (labels.length >= 2) {
    return `....${labels.slice(-2).join('.')}`
  }

  return `....${domain.slice(-8)}`
}
