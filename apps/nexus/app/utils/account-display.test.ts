import { describe, expect, it } from 'vitest'

import { formatCompactAccountLabel, formatCompactEmail } from './account-display'

describe('formatCompactEmail', () => {
  it('compacts long local and domain parts', () => {
    expect(formatCompactEmail('sjdlaqwerty@privaterelay.linux.do')).toBe('sjdla...@....linux.do')
  })

  it('keeps short emails readable', () => {
    expect(formatCompactEmail('team@tuff.dev')).toBe('team@tuff.dev')
  })

  it('compacts plain account labels with the shared account rule', () => {
    expect(formatCompactEmail('4mj6b7umhtksb17uiuw1fi8yz6pe')).toBe('4mj6b7...')
  })
})

describe('formatCompactAccountLabel', () => {
  it('compacts long random account labels', () => {
    expect(formatCompactAccountLabel('4mj6b7umhtksb17uiuw1fi8yz6pe')).toBe('4mj6b7...')
  })

  it('keeps short display names readable', () => {
    expect(formatCompactAccountLabel('Talex')).toBe('Talex')
  })

  it('uses email compaction for email-like labels', () => {
    expect(formatCompactAccountLabel('sjdlaqwerty@privaterelay.linux.do')).toBe('sjdla...@....linux.do')
  })
})
