import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'

export type ConversationBucketKey = 'today' | 'yesterday' | 'week' | 'earlier'

export interface ConversationBucket {
  key: ConversationBucketKey
  items: ConversationRecord[]
}

/**
 * Buckets by calendar day in local time, not by rolling 24-hour windows: a
 * thread from 23:50 must move from 今天 to 昨天 at midnight, not at 23:50 the
 * next day. Boundaries are built with `setDate` so a DST shift inside the week
 * still lands them on real midnights.
 */
export function bucketConversations(
  records: ConversationRecord[],
  now: number
): ConversationBucket[] {
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const todayStart = midnight.getTime()

  midnight.setDate(midnight.getDate() - 1)
  const yesterdayStart = midnight.getTime()

  // "近 7 天" reaches back so the window spans seven calendar days including
  // today; the two newest days are carved off by their own buckets above it.
  midnight.setDate(midnight.getDate() - 5)
  const weekStart = midnight.getTime()

  const buckets: Record<ConversationBucketKey, ConversationRecord[]> = {
    today: [],
    yesterday: [],
    week: [],
    earlier: []
  }

  // The transport lists newest-first already, but bucket rows must stay sorted
  // even if a caller hands over an unordered set, so order is re-established
  // here rather than assumed.
  const sorted = [...records].sort((a, b) => b.updatedAt - a.updatedAt)
  for (const record of sorted) {
    if (record.updatedAt >= todayStart) buckets.today.push(record)
    else if (record.updatedAt >= yesterdayStart) buckets.yesterday.push(record)
    else if (record.updatedAt >= weekStart) buckets.week.push(record)
    else buckets.earlier.push(record)
  }

  return (Object.keys(buckets) as ConversationBucketKey[])
    .map((key) => ({ key, items: buckets[key] }))
    .filter((bucket) => bucket.items.length > 0)
}
