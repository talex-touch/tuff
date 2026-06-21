import { describe, expect, it } from 'vitest'

import { formatCompactEmail } from './account-display'

describe('formatCompactEmail', () => {
  it('compacts long local and domain parts', () => {
    expect(formatCompactEmail('sjdlaqwerty@privaterelay.linux.do')).toBe('sjdla...@....linux.do')
  })

  it('keeps short emails readable', () => {
    expect(formatCompactEmail('team@tuff.dev')).toBe('team@tuff.dev')
  })
})
