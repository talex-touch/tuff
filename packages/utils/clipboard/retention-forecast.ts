/**
 * 「这条记录什么时候会被自动删除」。
 *
 * 这是清理条件的逆运算，必须和它严格同构。清理侧删除的条件是
 * `(timestamp < cutoff OR retention_expires_at < now) AND NOT favorite AND NOT protected`，
 * 所以这里的顺序是：收藏 → 受保护 → 两个到期时刻取更早的那个。
 *
 * 两边任何一处改动都要带着另一处走。界面承诺一个不会发生的删除，比不显示更糟——
 * 用户会据此决定要不要收藏它。
 */

export type ClipboardRetentionReason =
  /** 已收藏，永不自动删除。 */
  | 'favorite'
  /** 密钥类，永不自动删除。 */
  | 'protected'
  /** 会在 `expiresAt` 被删除。 */
  | 'policy'
  /** 类别策略关着或设成了永久保留，没有任何到期时刻。 */
  | 'disabled'

export interface ClipboardRetentionForecast {
  /** null 表示不会被自动删除。 */
  expiresAt: number | null
  reason: ClipboardRetentionReason
}

export interface ClipboardRetentionForecastInput {
  /** 记录时间，毫秒。 */
  timestamp: number | null
  isFavorite?: boolean | null
  retentionProtected?: boolean | null
  /** 这条记录自己的过期时刻，毫秒。验证码走这条。 */
  retentionExpiresAt?: number | null
  /** 当前生效的类别保留时长，null 表示永久保留或策略关闭。 */
  categoryRetentionMs: number | null
}

export function forecastClipboardRetention(
  input: ClipboardRetentionForecastInput,
): ClipboardRetentionForecast {
  if (input.isFavorite === true) {
    return { expiresAt: null, reason: 'favorite' }
  }
  if (input.retentionProtected === true) {
    return { expiresAt: null, reason: 'protected' }
  }

  const dueDates: number[] = []

  if (
    typeof input.timestamp === 'number' &&
    Number.isFinite(input.timestamp) &&
    typeof input.categoryRetentionMs === 'number' &&
    Number.isFinite(input.categoryRetentionMs)
  ) {
    dueDates.push(input.timestamp + input.categoryRetentionMs)
  }

  if (typeof input.retentionExpiresAt === 'number' && Number.isFinite(input.retentionExpiresAt)) {
    dueDates.push(input.retentionExpiresAt)
  }

  if (dueDates.length === 0) {
    return { expiresAt: null, reason: 'disabled' }
  }

  // 清理侧两个条件是 OR，所以先到的那个说了算。
  return { expiresAt: Math.min(...dueDates), reason: 'policy' }
}
