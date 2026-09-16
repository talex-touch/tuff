import { describe, expect, it } from 'vitest'
import { escapeLikePattern, foldOutboundLogs } from './app-usage-query-service'

/** The identity under test, a reverse-DNS bundle id with a dotted prefix worth mis-matching. */
const IDENTITY = 'com.foo.bar'

describe('escapeLikePattern', () => {
  it('leaves identifiers without LIKE wildcards byte-for-byte', () => {
    expect(escapeLikePattern('com.apple.Safari')).toBe('com.apple.Safari')
    expect(escapeLikePattern('org.mozilla.firefox-developer')).toBe('org.mozilla.firefox-developer')
  })

  it('prefixes every LIKE wildcard with a backslash', () => {
    const cases: Array<{ name: string; input: string; expected: string }> = [
      { name: 'percent', input: '100%app', expected: '100\\%app' },
      { name: 'underscore', input: 'com.foo.my_app', expected: 'com.foo.my\\_app' },
      { name: 'backslash', input: 'com.foo\\bar', expected: 'com.foo\\\\bar' },
      { name: 'mixed run', input: 'a%b_c\\d', expected: 'a\\%b\\_c\\\\d' },
      {
        name: 'underscore-dense reverse-DNS id',
        input: 'com.example.my_app_v2',
        expected: 'com.example.my\\_app\\_v2'
      }
    ]

    for (const testCase of cases) {
      expect(escapeLikePattern(testCase.input), testCase.name).toBe(testCase.expected)
    }
  })
})

describe('foldOutboundLogs', () => {
  it('tallies per destination and orders by descending count', () => {
    const matching = { context: JSON.stringify({ prevApp: IDENTITY }) }

    expect(
      foldOutboundLogs(
        [
          { itemId: 'dest-a', ...matching },
          { itemId: 'dest-b', ...matching },
          { itemId: 'dest-a', ...matching },
          { itemId: 'dest-c', ...matching },
          { itemId: 'dest-a', ...matching },
          { itemId: 'dest-c', ...matching }
        ],
        IDENTITY
      )
    ).toEqual([
      { toItemId: 'dest-a', count: 3 },
      { toItemId: 'dest-c', count: 2 },
      { toItemId: 'dest-b', count: 1 }
    ])
  })

  it('rejects rows that only name the identity in prevAppName', () => {
    // The SQL pre-filter is a substring match over the whole context, so it hands these rows over;
    // only the exact prevApp comparison may drop them.
    const rows = [
      {
        itemId: 'sibling-app',
        context: JSON.stringify({ prevApp: 'com.other.app', prevAppName: IDENTITY })
      },
      { itemId: 'unrelated-app', context: JSON.stringify({ prevAppName: IDENTITY }) }
    ]

    expect(foldOutboundLogs(rows, IDENTITY)).toEqual([])
  })

  it('rejects a prevApp that merely has the identity as a prefix', () => {
    const rows = [
      { itemId: 'other-app', context: JSON.stringify({ prevApp: 'com.foo.barbaz' }) },
      { itemId: 'other-app', context: JSON.stringify({ prevApp: 'com.foo.bar.extra' }) }
    ]

    expect(foldOutboundLogs(rows, IDENTITY)).toEqual([])
  })

  it('counts a whitespace-padded prevApp as the identity', () => {
    const rows = [{ itemId: 'dest-a', context: JSON.stringify({ prevApp: `  ${IDENTITY}  ` }) }]

    expect(foldOutboundLogs(rows, IDENTITY)).toEqual([{ toItemId: 'dest-a', count: 1 }])
  })

  it('skips unparseable, absent and unkeyed rows without disturbing the rest', () => {
    const matching = JSON.stringify({ prevApp: IDENTITY })
    const rows: Array<{ itemId: string; context: string | null }> = [
      { itemId: 'dest-a', context: matching },
      { itemId: 'broken-json', context: '{"prevApp":' },
      { itemId: 'missing-context', context: null },
      { itemId: '', context: matching },
      { itemId: 'dest-b', context: matching },
      { itemId: 'dest-a', context: matching }
    ]

    expect(foldOutboundLogs(rows, IDENTITY)).toEqual([
      { toItemId: 'dest-a', count: 2 },
      { toItemId: 'dest-b', count: 1 }
    ])
  })

  it('keeps the eight busiest destinations, not the first eight seen', () => {
    const rows = Array.from({ length: 10 }, (_, index) => {
      const count = index + 1
      return Array.from({ length: count }, () => ({
        itemId: `dest-${count}`,
        context: JSON.stringify({ prevApp: IDENTITY })
      }))
    }).flat()

    expect(foldOutboundLogs(rows, IDENTITY)).toEqual(
      [10, 9, 8, 7, 6, 5, 4, 3].map((count) => ({ toItemId: `dest-${count}`, count }))
    )
  })
})
