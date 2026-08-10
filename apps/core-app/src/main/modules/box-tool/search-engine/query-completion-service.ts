import type { TuffItem } from '@talex-touch/utils'
import type { DbUtils } from '../../../db/utils'
import { desc, sql } from 'drizzle-orm'
import * as schema from '../../../db/schema'
import { scheduleDbWrite } from '../../../db/db-write'
import { createLogger } from '../../../utils/logger'

const log = createLogger('QueryCompletionService')
const MIN_COMPLETION_QUERY_LENGTH = 2
const LIKE_ESCAPE_CHAR = '\\'
const SQLITE_LIKE_WILDCARD_REGEX = /[%_\\]/g

/**
 * Upper bound on rows pulled into JS for scoring. The final ranking is computed
 * in JS (frequency x recency x match quality), so the SQL LIMIT cannot simply be
 * `limit` — that would hand the JS sort a different candidate set than the one it
 * is meant to rank. The scan is ordered by the terms that dominate the score so
 * the strongest candidates fall inside the window.
 */
const COMPLETION_SCAN_LIMIT = 200

/** Neutralises SQLite LIKE metacharacters; pair with `ESCAPE ${LIKE_ESCAPE_CHAR}`. */
function escapeLikeWildcards(value: string): string {
  return value.replace(SQLITE_LIKE_WILDCARD_REGEX, (match) => `${LIKE_ESCAPE_CHAR}${match}`)
}

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
    avgInjectTime: 0
  }

  constructor(private dbUtils: DbUtils) {}

  /** Normalize query prefix: lowercase, trim, max 20 chars */
  private normalizePrefix(query: string): string {
    return query.toLowerCase().trim().slice(0, 20)
  }

  /** Record a query completion when user executes an item after search */
  async recordCompletion(query: string, item: TuffItem): Promise<void> {
    if (!query || !item.id) return

    const start = performance.now()
    const db = this.dbUtils.getDb()
    const prefix = this.normalizePrefix(query)
    const queryLength = query.length
    const label = 'query-completions.record'

    try {
      await scheduleDbWrite(label, async () => {
        const existing = await db
          .select()
          .from(schema.queryCompletions)
          .where(
            sql`${schema.queryCompletions.prefix} = ${prefix}
                  AND ${schema.queryCompletions.sourceId} = ${item.source.id}
                  AND ${schema.queryCompletions.itemId} = ${item.id}`
          )
          .get()

        if (existing) {
          const newCount = existing.completionCount + 1
          const newAvgLength =
            (existing.avgQueryLength * existing.completionCount + queryLength) / newCount

          await db
            .update(schema.queryCompletions)
            .set({
              completionCount: newCount,
              lastCompleted: new Date(),
              avgQueryLength: newAvgLength
            })
            .where(sql`id = ${existing.id}`)
          return
        }

        await db.insert(schema.queryCompletions).values({
          prefix,
          sourceId: item.source.id,
          itemId: item.id,
          completionCount: 1,
          lastCompleted: new Date(),
          avgQueryLength: queryLength,
          createdAt: new Date()
        })
      })

      const duration = performance.now() - start
      this.stats.totalRecorded++
      this.stats.avgRecordTime =
        (this.stats.avgRecordTime * (this.stats.totalRecorded - 1) + duration) /
        this.stats.totalRecorded

      log.debug('Recorded completion', {
        meta: { prefix, itemId: item.id, sourceId: item.source.id }
      })
    } catch (error) {
      log.error('Failed to record completion', { error })
    }
  }

  /** Get completion suggestions for a query prefix, sorted by frequency and recency */
  async getSuggestions(query: string, limit = 10): Promise<CompletionSuggestion[]> {
    if (!query || query.trim().length < MIN_COMPLETION_QUERY_LENGTH) return []

    const timer = log.time('getSuggestions')
    const db = this.dbUtils.getDb()
    const prefix = this.normalizePrefix(query)

    try {
      // Escaped and bounded. Previously the pattern came straight from user text,
      // so typing '%' matched every row, and there was no SQL LIMIT at all — the
      // `limit` argument was applied only after the whole table had been loaded
      // and exp()-scored in JS, on every debounced keystroke (#664).
      const likePattern = `${escapeLikeWildcards(prefix)}%`
      const results = await db
        .select()
        .from(schema.queryCompletions)
        .where(
          sql`${schema.queryCompletions.prefix} LIKE ${likePattern} ESCAPE ${LIKE_ESCAPE_CHAR}`
        )
        .orderBy(
          desc(schema.queryCompletions.completionCount),
          desc(schema.queryCompletions.lastCompleted)
        )
        .limit(Math.max(limit, COMPLETION_SCAN_LIMIT))
        .all()

      if (results.length === 0) {
        timer.end('debug', {
          level: 'debug'
        })
        return []
      }

      const now = Date.now()

      const suggestions = results.map((record) => {
        let score = record.completionCount * 10

        const daysSinceLastUsed = (now - record.lastCompleted.getTime()) / (1000 * 3600 * 24)
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
          score
        }
      })

      timer.end('debug', {
        level: 'debug'
      })
      return suggestions.sort((a, b) => b.score - a.score).slice(0, limit)
    } catch (error) {
      log.error('Failed to get suggestions', { error })
      return []
    }
  }

  /** Inject completion weights into search results based on historical completion data */
  async injectCompletionWeights(query: string, items: TuffItem[]): Promise<void> {
    if (!query || query.trim().length < MIN_COMPLETION_QUERY_LENGTH || items.length === 0) return

    const start = performance.now()

    try {
      const suggestions = await this.getSuggestions(query, 50)
      if (suggestions.length === 0) return

      const suggestionMap = new Map(suggestions.map((s) => [`${s.sourceId}:${s.itemId}`, s]))

      let injectedCount = 0
      for (const item of items) {
        const key = `${item.source.id}:${item.id}`
        const suggestion = suggestionMap.get(key)

        if (suggestion) {
          if (!item.meta) item.meta = {}

          // The ranker (tuff-sorter) reads this to apply a bounded match boost.
          // Do NOT mutate item.scoring.match here: tuff-sorter recomputes the
          // match score from scratch and never reads scoring.match, so writing
          // it had no effect on ranking.
          item.meta.completion = {
            count: suggestion.completionCount,
            lastCompleted: suggestion.lastCompleted.toISOString(),
            score: suggestion.score
          }

          injectedCount++
        }
      }

      const duration = performance.now() - start
      this.stats.totalInjected++
      this.stats.avgInjectTime =
        (this.stats.avgInjectTime * (this.stats.totalInjected - 1) + duration) /
        this.stats.totalInjected

      log.debug('Injected completion weights', {
        meta: { injectedCount, totalSuggestions: suggestions.length }
      })
    } catch (error) {
      log.error('Failed to inject completion weights', { error })
    }
  }

  getStats() {
    return { ...this.stats }
  }
}
