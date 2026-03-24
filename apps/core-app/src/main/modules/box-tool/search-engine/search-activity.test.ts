import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getLastSearchActivityAt,
  isSearchRecentlyActive,
  markSearchActivity
} from './search-activity'

describe('search activity', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    markSearchActivity(0)
  })

  afterEach(() => {
    markSearchActivity(0)
    vi.useRealTimers()
  })

  it('should return false when no activity has been recorded', () => {
    expect(getLastSearchActivityAt()).toBe(0)
    expect(isSearchRecentlyActive()).toBe(false)
  })

  it('should report active when activity is within the default window', () => {
    markSearchActivity(Date.now())
    vi.advanceTimersByTime(1500)

    expect(isSearchRecentlyActive()).toBe(true)
  })

  it('should report inactive when activity is outside the custom window', () => {
    markSearchActivity(Date.now())
    vi.advanceTimersByTime(1201)

    expect(isSearchRecentlyActive(1200)).toBe(false)
  })
})
