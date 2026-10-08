import { describe, expect, it } from 'vitest'
import {
  FILE_MAINTENANCE_DELAY_MS,
  FILE_MAINTENANCE_LAG_BACKOFF_DELAY_MS,
  resolveFileMaintenanceDelayMs
} from './file-provider-maintenance-service'

describe('resolveFileMaintenanceDelayMs', () => {
  const now = 1_000_000

  it('keeps the normal gap without a recent lag', () => {
    expect(resolveFileMaintenanceDelayMs(null, now)).toBe(FILE_MAINTENANCE_DELAY_MS)
    expect(resolveFileMaintenanceDelayMs(undefined, now)).toBe(FILE_MAINTENANCE_DELAY_MS)
  })

  it('spaces rounds out right after a severe lag', () => {
    expect(resolveFileMaintenanceDelayMs({ lagMs: 2545, at: now - 3_000 }, now)).toBe(
      FILE_MAINTENANCE_LAG_BACKOFF_DELAY_MS
    )
  })

  it('ignores lags that are too small or too old', () => {
    expect(resolveFileMaintenanceDelayMs({ lagMs: 400, at: now - 1_000 }, now)).toBe(
      FILE_MAINTENANCE_DELAY_MS
    )
    expect(resolveFileMaintenanceDelayMs({ lagMs: 3_000, at: now - 60_000 }, now)).toBe(
      FILE_MAINTENANCE_DELAY_MS
    )
  })
})
