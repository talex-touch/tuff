export interface SubscriptionActiveLike {
  isActive?: boolean
  status?: string | null
  expiresAt?: string | number | null
}

const ACTIVE_STATUSES = new Set(['ACTIVE', 'TRIALING'])
const INACTIVE_STATUSES = new Set(['INACTIVE', 'EXPIRED', 'CANCELED', 'CANCELLED'])

function parseExpiresAt(expiresAt: SubscriptionActiveLike['expiresAt']): number | null {
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') {
    return null
  }

  const parsedDate = typeof expiresAt === 'number' ? new Date(expiresAt) : new Date(expiresAt)
  const timestamp = parsedDate.getTime()

  return Number.isFinite(timestamp) ? timestamp : null
}

function normalizeStatus(status: string | null | undefined): string {
  return typeof status === 'string' ? status.trim().toUpperCase() : ''
}

export function computeSubscriptionActive(
  subscription: SubscriptionActiveLike | null | undefined,
  now = Date.now()
): boolean {
  if (!subscription) {
    return true
  }

  if (typeof subscription.isActive === 'boolean') {
    return subscription.isActive
  }

  const normalizedStatus = normalizeStatus(subscription.status)
  if (ACTIVE_STATUSES.has(normalizedStatus)) {
    return true
  }
  if (INACTIVE_STATUSES.has(normalizedStatus)) {
    return false
  }

  const expiresAt = parseExpiresAt(subscription.expiresAt)
  if (expiresAt === null) {
    return true
  }

  return expiresAt > now
}
