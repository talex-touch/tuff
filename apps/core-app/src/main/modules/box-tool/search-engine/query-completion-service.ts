import type { TuffItem } from '@talex-touch/utils'
import type { DbUtils } from '../../../db/utils'
import { sql } from 'drizzle-orm'
import * as schema from '../../../db/schema'
import { createLogger } from '../../../utils/logger'

const log = createLogger('QueryCompletionService')

export interface CompletionSuggestion {
  sourceId: string
  itemId: string
  prefix: string
  completionCount: number
  lastCompleted: Date
  score: number
}

/**
 * Service for tracking query prefixes and executed items to enable smart auto-completion
 * Records search query → execute action associations for intelligent suggestions
 */
export class QueryCompletionService {
  private stats = {
    totalRecorded: 0,
    totalInjected: 0,
    avgRecordTime: 0,
    avgInjectTime: 0,
  }

  constructor(private dbUtils: DbUtils) {}

  /** Normalize query prefix: lowercase, trim, max 20 chars */
  private normalizePrefix(query: string): string {
    return query.toLowerCase().trim().slice(0, 20)
  }

  /** Record a query completion when user executes an item after search */
  async recordCompletion(query: string, item: TuffItem): Promise<void> {
    if (!query || !item.id)
      return

    const start = performance.now()
    const db = this.dbUtils.getDb()
    const prefix = this.normalizePrefix(query)
    const queryLength = query.length

    try {
      const existing = await db
        .select()
        .from(schema.queryCompletions)
        .where(
          sql`${schema.queryCompletions.prefix} = ${prefix}
              AND ${schema.queryCompletions.sourceId} = ${item.source.id}
              AND ${schema.queryCompletions.itemId} = ${item.id}`,
        )
        .get()

      if (existing) {
        const newCount = existing.completionCount + 1
        const newAvgLength
          = (existing.avgQueryLength * existing.completionCount + queryLength) / newCount

        await db
          .update(schema.queryCompletions)
          .set({
            completionCount: newCount,
            lastCompleted: new Date(),
            avgQueryLength: newAvgLength,
          })
          .where(sql`id = ${existing.id}`)
      }
      else {
        await db.insert(schema.queryCompletions).values({
          prefix,
          sourceId: item.source.id,
          itemId: item.id,
          completionCount: 1,
          lastCompleted: new Date(),
          avgQueryLength: queryLength,
          createdAt: new Date(),
        })
      }

      const duration = performance.now() - start
      this.stats.totalRecorded++
      this.stats.avgRecordTime
        = (this.stats.avgRecordTime * (this.stats.totalRecorded - 1) + duration)
          / this.stats.totalRecorded

      log.debug('Recorded completion', {
        meta: { prefix, itemId: item.id, sourceId: item.source.id },
      })
    }
    catch (error) {
      log.error('Failed to record completion', { error })
    }
  }

  /** Get completion suggestions for a query prefix, sorted by frequency and recency */
  async getSuggestions(query: string, limit = 10): Promise<CompletionSuggestion[]> {
    if (!query)
      return []

    const timer = log.time('getSuggestions')
    const db = this.dbUtils.getDb()
    const prefix = this.normalizePrefix(query)

    try {
      const results = await db
        .select()
        .from(schema.queryCompletions)
        .where(sql`${schema.queryCompletions.prefix} LIKE ${`${prefix}%`}`)
        .all()

      if (results.length === 0) {
        timer.end('debug')
        return []
      }

      const now = Date.now()

      const suggestions = results.map((record) => {
        let score = record.completionCount * 10

        const daysSinceLastUsed
          = (now - record.lastCompleted.getTime()) / (1000 * 3600 * 24)
        const recencyFactor = Math.exp(-0.05 * daysSinceLastUsed)
        score *= recencyFactor

        const matchQuality = prefix.length / record.avgQueryLength
        score *= 1 + matchQuality * 0.5

        return {
          sourceId: record.sourceId,
          itemId: record.itemId,
          prefix: record.prefix,
          completionCount: record.completionCount,
          lastCompleted: record.lastCompleted,
          score,
        }
      })

      timer.end('debug')
      return suggestions.sort((a, b) => b.score - a.score).slice(0, limit)
    }
    catch (error) {
      log.error('Failed to get suggestions', { error })
      return []
    }
  }

  /** Inject completion weights into search results based on historical completion data */
  async injectCompletionWeights(query: string, items: TuffItem[]): Promise<void> {
    if (!query || items.length === 0)
      return

    const start = performance.now()

    try {
      const suggestions = await this.getSuggestions(query, 50)
      if (suggestions.length === 0)
        return

      const suggestionMap = new Map(
        suggestions.map(s => [`${s.sourceId}:${s.itemId}`, s]),
      )

      let injectedCount = 0
      for (const item of items) {
        const key = `${item.source.id}:${item.id}`
        const suggestion = suggestionMap.get(key)

        if (suggestion) {
          if (!item.meta)
            item.meta = {}

          item.meta.completion = {
            count: suggestion.completionCount,
            lastCompleted: suggestion.lastCompleted.toISOString(),
            score: suggestion.score,
          }

          if (item.scoring) {
            const boostFactor = 1 + Math.min(suggestion.completionCount * 0.1, 0.5)
            if (item.scoring.match !== undefined) {
              item.scoring.match *= boostFactor
            }
          }
          injectedCount++
        }
      }

      const duration = performance.now() - start
      this.stats.totalInjected++
      this.stats.avgInjectTime
        = (this.stats.avgInjectTime * (this.stats.totalInjected - 1) + duration)
          / this.stats.totalInjected

      log.debug('Injected completion weights', {
        meta: { injectedCount, totalSuggestions: suggestions.length },
      })
    }
    catch (error) {
      log.error('Failed to inject completion weights', { error })
    }
  }

  /** Remove completion records older than retention period */
  async cleanupOldCompletions(retentionDays = 90): Promise<number> {
    const timer = log.time('cleanupOldCompletions')
    const db = this.dbUtils.getDb()

    try {
      const expirationDate = new Date()
      expirationDate.setDate(expirationDate.getDate() - retentionDays)

      await db
        .delete(schema.queryCompletions)
        .where(sql`${schema.queryCompletions.lastCompleted} < ${expirationDate}`)

      timer.end('info')
      log.info('Cleaned up old completions', {
        meta: { cutoffDate: expirationDate.toISOString() },
      })

      return 0
    }
    catch (error) {
      log.error('Failed to cleanup old completions', { error })
      return 0
    }
  }

  getStats() {
    return { ...this.stats }
  }
}
