import { describe, expect, it } from 'vitest'
import { forecastClipboardRetention } from '../clipboard/retention-forecast'

const DAY = 86_400_000
const HOUR = 3_600_000
const NOW = Date.UTC(2026, 8, 6, 20, 31)
const NINETY_DAYS = 90 * DAY

describe('clipboard retention forecast', () => {
  it('reports no expiry for the two exemptions, in the order the sweep applies them', () => {
    const base = { timestamp: NOW, categoryRetentionMs: NINETY_DAYS }

    expect(forecastClipboardRetention({ ...base, isFavorite: true })).toEqual({
      expiresAt: null,
      reason: 'favorite',
    })
    expect(forecastClipboardRetention({ ...base, retentionProtected: true })).toEqual({
      expiresAt: null,
      reason: 'protected',
    })
    // 同时命中时报「已收藏」：那是用户自己的动作，比系统判定更值得解释。
    expect(
      forecastClipboardRetention({ ...base, isFavorite: true, retentionProtected: true }).reason,
    ).toBe('favorite')
  })

  it('falls back to the category window for an ordinary entry', () => {
    expect(
      forecastClipboardRetention({ timestamp: NOW, categoryRetentionMs: NINETY_DAYS }),
    ).toEqual({ expiresAt: NOW + NINETY_DAYS, reason: 'policy' })
  })

  /** 清理侧两个到期条件是 OR，所以先到的那个说了算。 */
  it('takes whichever of the two due dates arrives first', () => {
    const soon = NOW + HOUR
    expect(
      forecastClipboardRetention({
        timestamp: NOW,
        retentionExpiresAt: soon,
        categoryRetentionMs: NINETY_DAYS,
      }),
    ).toEqual({ expiresAt: soon, reason: 'policy' })

    // 反过来也成立：per-item 比类别窗口还晚时，类别窗口先到。
    const late = NOW + 365 * DAY
    expect(
      forecastClipboardRetention({
        timestamp: NOW,
        retentionExpiresAt: late,
        categoryRetentionMs: NINETY_DAYS,
      }).expiresAt,
    ).toBe(NOW + NINETY_DAYS)
  })

  it('says nothing will happen when the category policy is off', () => {
    expect(forecastClipboardRetention({ timestamp: NOW, categoryRetentionMs: null })).toEqual({
      expiresAt: null,
      reason: 'disabled',
    })

    // 但一条带自己过期时刻的记录仍然会到期——策略关掉不等于验证码永久保留。
    expect(
      forecastClipboardRetention({
        timestamp: NOW,
        retentionExpiresAt: NOW + HOUR,
        categoryRetentionMs: null,
      }),
    ).toEqual({ expiresAt: NOW + HOUR, reason: 'policy' })
  })

  it('does not invent a due date from a missing timestamp', () => {
    expect(
      forecastClipboardRetention({ timestamp: null, categoryRetentionMs: NINETY_DAYS }),
    ).toEqual({ expiresAt: null, reason: 'disabled' })
  })

  /**
   * 这条把预测和清理条件绑在一起。清理侧删除的条件是
   * `(timestamp < cutoff OR retention_expires_at < now) AND NOT favorite AND NOT protected`，
   * 所以「预测说已经到期」必须恰好等价于「清理侧现在会删它」。
   *
   * 两者分开演化的话，界面会承诺一个不会发生的删除——用户据此决定要不要收藏它。
   */
  it('agrees with the sweep about which rows are due right now', () => {
    const cutoff = NOW - NINETY_DAYS
    const rows = [
      { name: 'old-ordinary', timestamp: cutoff - 1 },
      { name: 'fresh-ordinary', timestamp: NOW - 1 },
      { name: 'expired-code', timestamp: NOW - 60, retentionExpiresAt: NOW - 1 },
      { name: 'unexpired-code', timestamp: NOW - 60, retentionExpiresAt: NOW + HOUR },
      { name: 'old-favorite', timestamp: cutoff - 1, isFavorite: true },
      { name: 'old-secret', timestamp: cutoff - 1, retentionProtected: true },
      { name: 'expired-code-favorite', timestamp: NOW - 60, retentionExpiresAt: NOW - 1, isFavorite: true },
    ]

    /** 清理侧的判定，照 SQL 逐字翻译。 */
    const sweepWouldDelete = (row: (typeof rows)[number]): boolean => {
      if (row.isFavorite || row.retentionProtected) return false
      return row.timestamp < cutoff || (row.retentionExpiresAt != null && row.retentionExpiresAt < NOW)
    }

    for (const row of rows) {
      const forecast = forecastClipboardRetention({ ...row, categoryRetentionMs: NINETY_DAYS })
      const forecastSaysDue = forecast.expiresAt !== null && forecast.expiresAt < NOW
      expect(forecastSaysDue, `${row.name} disagrees`).toBe(sweepWouldDelete(row))
    }
  })
})
