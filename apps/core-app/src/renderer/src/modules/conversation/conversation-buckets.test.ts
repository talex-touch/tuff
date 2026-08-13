import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import { describe, expect, it } from 'vitest'
import { bucketConversations } from './conversation-buckets'

/** Local-time constructor on purpose: bucket boundaries are local midnights. */
const NOW = new Date(2026, 7, 6, 12, 0, 0).getTime() // Aug 6, 12:00

function record(id: string, updatedAt: number): ConversationRecord {
  return { id, title: id, createdAt: updatedAt, updatedAt }
}

function at(daysAgo: number, hour: number): number {
  const date = new Date(2026, 7, 6 - daysAgo, hour, 0, 0)
  return date.getTime()
}

describe('bucketConversations', () => {
  it('splits records across the calendar buckets', () => {
    const buckets = bucketConversations(
      [
        record('today', at(0, 9)),
        record('yesterday', at(1, 23)),
        record('week', at(4, 8)),
        record('earlier', at(30, 8))
      ],
      NOW
    )

    expect(buckets.map((bucket) => bucket.key)).toEqual(['today', 'yesterday', 'week', 'earlier'])
    expect(buckets.map((bucket) => bucket.items.map((item) => item.id))).toEqual([
      ['today'],
      ['yesterday'],
      ['week'],
      ['earlier']
    ])
  })

  it('drops empty buckets instead of rendering hollow headings', () => {
    const buckets = bucketConversations([record('today', at(0, 9))], NOW)
    expect(buckets).toHaveLength(1)
    expect(buckets[0]?.key).toBe('today')
  })

  it('treats midnight itself as part of the newer day', () => {
    const todayMidnight = new Date(2026, 7, 6, 0, 0, 0).getTime()
    const buckets = bucketConversations([record('edge', todayMidnight)], NOW)
    expect(buckets[0]?.key).toBe('today')
  })

  it('keeps 近 7 天 to seven calendar days including today', () => {
    // Six days back is the oldest calendar day still inside the window;
    // seven days back has aged out of it.
    const inside = bucketConversations([record('in', at(6, 8))], NOW)
    const outside = bucketConversations([record('out', at(7, 23))], NOW)
    expect(inside[0]?.key).toBe('week')
    expect(outside[0]?.key).toBe('earlier')
  })

  it('re-sorts newest-first rather than trusting caller order', () => {
    const buckets = bucketConversations(
      [record('older', at(0, 8)), record('newer', at(0, 11))],
      NOW
    )
    expect(buckets[0]?.items.map((item) => item.id)).toEqual(['newer', 'older'])
  })

  it('returns nothing for an empty list', () => {
    expect(bucketConversations([], NOW)).toEqual([])
  })
})
