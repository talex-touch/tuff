import { and, asc, eq, gte, lt, lte, sql } from 'drizzle-orm'
import type { VoiceInsights } from '@talex-touch/utils/transport/sdk/domains/voice'
import { resolveCurrentAuxDb, scheduleAuxWrite } from '../../db/db-write'
import * as schema from '../../db/schema'

const NON_VISIBLE_CHARACTER = /[\s\p{P}]/u
const BASELINE_TYPING_CHARACTERS_PER_MINUTE = 40
const INSIGHTS_STATE_ID = 1
const MAX_DAYS = 365

interface VoiceInsightSuccess {
  readonly captureId: string
  readonly capturedAt: number
  readonly durationMs: number
  readonly text: string
  readonly polished: boolean
}

function localDate(now: number): string {
  const date = new Date(now)
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function previousDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day))
  value.setUTCDate(value.getUTCDate() - 1)
  return value.toISOString().slice(0, 10)
}

function firstIncludedDate(today: string): string {
  let date = today
  for (let index = 1; index < MAX_DAYS; index += 1) date = previousDate(date)
  return date
}

function visibleCharacterCount(text: string): number {
  let count = 0
  for (const character of text.normalize('NFC')) {
    if (!NON_VISIBLE_CHARACTER.test(character)) count += 1
  }
  return count
}

function timezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function zeroInsights(now: number): VoiceInsights {
  return {
    startedAt: null,
    updatedAt: now,
    timezone: timezone(),
    totalCharacters: 0,
    totalDurationMs: 0,
    sessionCount: 0,
    polishedSessionCount: 0,
    estimatedSavedMs: 0,
    typingCharactersPerMinute: BASELINE_TYPING_CHARACTERS_PER_MINUTE,
    averageCharactersPerMinute: null,
    activeDays: 0,
    currentStreak: 0,
    longestStreak: 0,
    days: []
  }
}

function streaks(
  days: readonly { date: string }[],
  today: string
): {
  currentStreak: number
  longestStreak: number
} {
  const active = new Set(days.map((day) => day.date))
  let currentStreak = 0
  let cursor = active.has(today) ? today : previousDate(today)
  while (active.has(cursor)) {
    currentStreak += 1
    cursor = previousDate(cursor)
  }

  let longestStreak = 0
  let running = 0
  let previous: string | null = null
  for (const { date } of days) {
    running = previous === previousDate(date) ? running + 1 : 1
    if (running > longestStreak) longestStreak = running
    previous = date
  }
  return { currentStreak, longestStreak }
}

/**
 * Main-owned, durable aggregate-only voice usage store.
 *
 * It deliberately stores no transcript, audio, provider payload, active-app metadata, or caller.
 * A successful capture identity is retained only to make aggregate increments idempotent. `clear`
 * advances a durable generation so delayed/retried writes created before it cannot resurrect data.
 */
export class VoiceInsightsStore {
  private generation = 0

  async recordSuccess(input: VoiceInsightSuccess): Promise<void> {
    const characters = visibleCharacterCount(input.text)
    if (!input.captureId || characters === 0) return

    const observedGeneration = this.generation
    const capturedAt = Number.isFinite(input.capturedAt)
      ? Math.max(0, Math.floor(input.capturedAt))
      : Date.now()
    const durationMs = Number.isFinite(input.durationMs)
      ? Math.max(0, Math.floor(input.durationMs))
      : 0
    const day = localDate(capturedAt)

    await scheduleAuxWrite('voice-insights.record-success', async (db) => {
      if (observedGeneration !== this.generation) return
      await db.transaction(async (tx) => {
        const existingState = await tx
          .select({ generation: schema.voiceInsightsState.generation })
          .from(schema.voiceInsightsState)
          .where(eq(schema.voiceInsightsState.id, INSIGHTS_STATE_ID))
          .get()
        if (observedGeneration !== this.generation) return
        const expectedGeneration = existingState?.generation ?? 0

        if (!existingState) {
          await tx.insert(schema.voiceInsightsState).values({
            id: INSIGHTS_STATE_ID,
            generation: expectedGeneration,
            startedAt: capturedAt,
            updatedAt: capturedAt,
            timezone: timezone(),
            totalCharacters: 0,
            totalDurationMs: 0,
            sessionCount: 0,
            polishedSessionCount: 0,
            estimatedSavedMs: 0
          })
        }

        const inserted = await tx
          .insert(schema.voiceInsightCaptures)
          .values({ captureId: input.captureId, generation: expectedGeneration, capturedAt })
          .onConflictDoNothing()
          .returning({ captureId: schema.voiceInsightCaptures.captureId })
        if (inserted.length === 0) return
        const oldestDay = firstIncludedDate(localDate(capturedAt))
        const oldestCaptureAt = capturedAt - MAX_DAYS * 24 * 60 * 60 * 1_000
        await tx.delete(schema.voiceInsightDays).where(lt(schema.voiceInsightDays.day, oldestDay))
        await tx
          .delete(schema.voiceInsightCaptures)
          .where(lt(schema.voiceInsightCaptures.capturedAt, oldestCaptureAt))

        await tx
          .insert(schema.voiceInsightDays)
          .values({ day, characters, durationMs, sessionCount: 1 })
          .onConflictDoUpdate({
            target: schema.voiceInsightDays.day,
            set: {
              characters: sql`${schema.voiceInsightDays.characters} + ${characters}`,
              durationMs: sql`${schema.voiceInsightDays.durationMs} + ${durationMs}`,
              sessionCount: sql`${schema.voiceInsightDays.sessionCount} + 1`
            }
          })
        await tx
          .update(schema.voiceInsightsState)
          .set({
            startedAt: sql`COALESCE(${schema.voiceInsightsState.startedAt}, ${capturedAt})`,
            updatedAt: capturedAt,
            timezone: timezone(),
            totalCharacters: sql`${schema.voiceInsightsState.totalCharacters} + ${characters}`,
            totalDurationMs: sql`${schema.voiceInsightsState.totalDurationMs} + ${durationMs}`,
            sessionCount: sql`${schema.voiceInsightsState.sessionCount} + 1`,
            polishedSessionCount: input.polished
              ? sql`${schema.voiceInsightsState.polishedSessionCount} + 1`
              : schema.voiceInsightsState.polishedSessionCount,
            estimatedSavedMs: sql`MAX(0, (((${schema.voiceInsightsState.totalCharacters} + ${characters}) * 60000) / ${BASELINE_TYPING_CHARACTERS_PER_MINUTE}) - (${schema.voiceInsightsState.totalDurationMs} + ${durationMs}))`
          })
          .where(
            and(
              eq(schema.voiceInsightsState.id, INSIGHTS_STATE_ID),
              eq(schema.voiceInsightsState.generation, expectedGeneration)
            )
          )
      })
    })
  }

  async getInsights(now = Date.now()): Promise<VoiceInsights> {
    const db = resolveCurrentAuxDb()?.db
    if (!db) return zeroInsights(now)

    const today = localDate(now)
    const { state, days } = await db.transaction(async (tx) => {
      const state = await tx
        .select()
        .from(schema.voiceInsightsState)
        .where(eq(schema.voiceInsightsState.id, INSIGHTS_STATE_ID))
        .get()
      const days = await tx
        .select()
        .from(schema.voiceInsightDays)
        .where(
          and(
            gte(schema.voiceInsightDays.day, firstIncludedDate(today)),
            lte(schema.voiceInsightDays.day, today)
          )
        )
        .orderBy(asc(schema.voiceInsightDays.day))
      return { state, days }
    })
    if (!state || state.sessionCount === 0) return zeroInsights(now)

    const normalizedDays = days.map((day) => ({
      date: day.day,
      characters: Math.max(0, day.characters),
      durationMs: Math.max(0, day.durationMs),
      sessions: Math.max(0, day.sessionCount)
    }))
    const { currentStreak, longestStreak } = streaks(normalizedDays, today)
    const totalDurationMs = Math.max(0, state.totalDurationMs)
    const totalCharacters = Math.max(0, state.totalCharacters)
    return {
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
      timezone: state.timezone || timezone(),
      totalCharacters,
      totalDurationMs,
      sessionCount: Math.max(0, state.sessionCount),
      polishedSessionCount: Math.max(0, state.polishedSessionCount),
      estimatedSavedMs: Math.max(0, state.estimatedSavedMs),
      typingCharactersPerMinute: BASELINE_TYPING_CHARACTERS_PER_MINUTE,
      averageCharactersPerMinute:
        totalDurationMs > 0 ? Math.round((totalCharacters / totalDurationMs) * 60_000) : null,
      activeDays: normalizedDays.length,
      currentStreak,
      longestStreak,
      days: normalizedDays
    }
  }

  async clearInsights(now = Date.now()): Promise<void> {
    const priorGeneration = this.generation
    const nextGeneration = priorGeneration + 1
    this.generation = nextGeneration
    const updatedAt = Number.isFinite(now) ? Math.max(0, Math.floor(now)) : Date.now()

    try {
      await scheduleAuxWrite('voice-insights.clear', async (db) => {
        await db.transaction(async (tx) => {
          const existing = await tx
            .select({ generation: schema.voiceInsightsState.generation })
            .from(schema.voiceInsightsState)
            .where(eq(schema.voiceInsightsState.id, INSIGHTS_STATE_ID))
            .get()
          const durableGeneration = (existing?.generation ?? 0) + 1
          await tx.delete(schema.voiceInsightCaptures)
          await tx.delete(schema.voiceInsightDays)
          await tx
            .insert(schema.voiceInsightsState)
            .values({
              id: INSIGHTS_STATE_ID,
              generation: durableGeneration,
              startedAt: null,
              updatedAt,
              timezone: timezone(),
              totalCharacters: 0,
              totalDurationMs: 0,
              sessionCount: 0,
              polishedSessionCount: 0,
              estimatedSavedMs: 0
            })
            .onConflictDoUpdate({
              target: schema.voiceInsightsState.id,
              set: {
                generation: durableGeneration,
                startedAt: null,
                updatedAt,
                timezone: timezone(),
                totalCharacters: 0,
                totalDurationMs: 0,
                sessionCount: 0,
                polishedSessionCount: 0,
                estimatedSavedMs: 0
              }
            })
        })
      })
    } catch (error) {
      if (this.generation === nextGeneration) this.generation = priorGeneration
      throw error
    }
  }
}

export const voiceInsightsStore = new VoiceInsightsStore()
