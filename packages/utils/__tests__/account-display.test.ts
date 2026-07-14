import { describe, expect, it } from 'vitest'

import { formatCompactAccountLabel, formatCompactEmail } from '../account/account-display'

describe('formatCompactEmail', () => {
  it.each([
    {
      name: 'long private relay email domains',
      value: 'sjdlaqwerty@privaterelay.linux.do',
      expected: 'sjdla...@....linux.do',
    },
    {
      name: 'short emails',
      value: 'team@tuff.dev',
      expected: 'team@tuff.dev',
    },
    {
      name: 'long non-email account labels',
      value: '4mj6b7umhtksb17uiuw1fi8yz6pe',
      expected: '4mj6b7...',
    },
  ])('$name format as $expected', ({ value, expected }) => {
    expect(formatCompactEmail(value)).toBe(expected)
  })
})

describe('formatCompactAccountLabel', () => {
  it.each([
    {
      name: 'plain non-email labels',
      value: '4mj6b7umhtksb17uiuw1fi8yz6pe',
      expected: '4mj6b7...',
    },
    {
      name: 'short display names',
      value: 'Talex',
      expected: 'Talex',
    },
    {
      name: 'email-like labels',
      value: 'sjdlaqwerty@privaterelay.linux.do',
      expected: 'sjdla...@....linux.do',
    },
  ])('$name format as $expected', ({ value, expected }) => {
    expect(formatCompactAccountLabel(value)).toBe(expected)
  })
})
