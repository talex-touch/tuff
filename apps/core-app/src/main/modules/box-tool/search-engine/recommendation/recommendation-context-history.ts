import type { ContextSignal, RecommendationEvidence } from '@talex-touch/utils/core-box'
import type { RecommendationHistoryEvent } from '../../../../db/utils'
import { FREQUENT_MIN_ACTIVE_DAYS_30, FREQUENT_MIN_EXECUTES_30 } from './recommendation-utils'

const HISTORY_WINDOW_MS = 30 * 86_400_000
const HOUR_MS = 3_600_000
const SOURCE_MIN_EXECUTES = 3
const SOURCE_MIN_ACTIVE_DAYS = 2
/** Five percentage points = 1/20; compare counts to avoid a rounded false preference. */
const SOURCE_SHARE_GAIN_DENOMINATOR = 20
const SOURCE_FULL_EXECUTES = 10
export const RECOMMENDATION_CONTEXT_SCORE_MAX = 25
const YESTERDAY_SCORE_MAX = 5

export interface RecommendationContextCandidate {
  sourceId: string
  itemId: string
  sourceType: string
  score: number
  source: 'yesterday' | 'app-context'
  evidence: RecommendationEvidence
}

interface TargetHistory {
  sourceId: string
  itemId: string
  sourceType: string
  executeCount: number
  sourceCount: number
  sourceDays: Set<number>
  jointCount: number
  jointDays: Set<number>
  yesterdayCount: number
  yesterdayLastExecutedAt: number
}

/**
 * Scene recall and evidence from admitted events only. Source preference is measured
 * against the same global window, so a universally popular target is not an app association.
 */
export function buildRecommendationContextCandidates(
  events: readonly RecommendationHistoryEvent[],
  context: ContextSignal,
  now = Date.now()
): RecommendationContextCandidate[] {
  if (!Number.isFinite(now)) return []
  const timeAvailable = context.timeAvailable !== false
  const foregroundApp = context.foregroundApp
  const sourceIdentity = foregroundApp?.bundleId.trim().toLowerCase()
  // The generic development Electron identifier cannot distinguish different apps.
  const trustedSource = sourceIdentity && sourceIdentity !== 'com.github.electron'
  const localNow = new Date(now)
  const yesterdayAnchor = new Date(now)
  yesterdayAnchor.setDate(yesterdayAnchor.getDate() - 1)
  const yesterdayStart = new Date(yesterdayAnchor)
  yesterdayStart.setHours(0, 0, 0, 0)
  const yesterdayEnd = new Date(yesterdayStart)
  yesterdayEnd.setDate(yesterdayEnd.getDate() + 1)
  const currentClockMinutes =
    context.time.hourOfDay * 60 + localNow.getMinutes() + localNow.getSeconds() / 60
  const targets = new Map<string, TargetHistory>()
  let totalExecutions = 0
  let sourceExecutions = 0

  for (const event of events) {
    if (
      !event.sourceId ||
      !event.itemId ||
      !Number.isFinite(event.timestamp) ||
      event.timestamp <= 0 ||
      event.timestamp < now - HISTORY_WINDOW_MS ||
      event.timestamp > now
    ) {
      continue
    }
    const key = `${event.sourceId}\u0000${event.itemId}`
    let target = targets.get(key)
    if (!target) {
      target = {
        sourceId: event.sourceId,
        itemId: event.itemId,
        sourceType: event.sourceType,
        executeCount: 0,
        sourceCount: 0,
        sourceDays: new Set(),
        jointCount: 0,
        jointDays: new Set(),
        yesterdayCount: 0,
        yesterdayLastExecutedAt: 0
      }
      targets.set(key, target)
    }
    target.executeCount += 1
    totalExecutions += 1
    if (
      timeAvailable &&
      event.timestamp >= yesterdayStart.getTime() &&
      event.timestamp < yesterdayEnd.getTime() &&
      Math.abs(event.timestamp - yesterdayAnchor.getTime()) <= HOUR_MS
    ) {
      target.yesterdayCount += 1
      target.yesterdayLastExecutedAt = Math.max(target.yesterdayLastExecutedAt, event.timestamp)
    }
    if (!trustedSource || event.previousApp?.trim().toLowerCase() !== sourceIdentity) continue
    target.sourceCount += 1
    sourceExecutions += 1
    const localEvent = new Date(event.timestamp)
    const localDay =
      localEvent.getFullYear() * 10_000 + (localEvent.getMonth() + 1) * 100 + localEvent.getDate()
    target.sourceDays.add(localDay)
    if (timeAvailable) {
      const eventClockMinutes =
        localEvent.getHours() * 60 + localEvent.getMinutes() + localEvent.getSeconds() / 60
      const clockDistance = Math.abs(eventClockMinutes - currentClockMinutes)
      if (Math.min(clockDistance, 24 * 60 - clockDistance) <= 60) {
        target.jointCount += 1
        target.jointDays.add(localDay)
      }
    }
  }

  const candidates: RecommendationContextCandidate[] = []
  for (const target of targets.values()) {
    const baselineShare = target.executeCount / totalExecutions
    const sourceShare = sourceExecutions > 0 ? target.sourceCount / sourceExecutions : 0
    const shareGainNumerator =
      target.sourceCount * totalExecutions - sourceExecutions * target.executeCount
    let sourceScore = 0
    if (
      target.sourceCount >= SOURCE_MIN_EXECUTES &&
      target.sourceDays.size >= SOURCE_MIN_ACTIVE_DAYS &&
      shareGainNumerator * SOURCE_SHARE_GAIN_DENOMINATOR > sourceExecutions * totalExecutions
    ) {
      const preferenceGain = (sourceShare - baselineShare) / (1 - baselineShare)
      const confidence =
        Math.min(1, target.sourceCount / SOURCE_FULL_EXECUTES) *
        Math.min(1, target.sourceDays.size / FREQUENT_MIN_ACTIVE_DAYS_30)
      sourceScore = Math.min(
        RECOMMENDATION_CONTEXT_SCORE_MAX,
        RECOMMENDATION_CONTEXT_SCORE_MAX * preferenceGain * confidence
      )
    }
    const yesterdayScore =
      target.yesterdayCount > 0
        ? YESTERDAY_SCORE_MAX * (1 - Math.exp(-target.yesterdayCount / 2))
        : 0
    // One scene budget: yesterday and source recall do not pay the same item twice.
    const score = Math.max(sourceScore, yesterdayScore)
    if (score <= 0) continue
    const evidence: RecommendationEvidence = {}
    if (target.yesterdayCount > 0) {
      evidence.yesterday = {
        lastExecutedAt: target.yesterdayLastExecutedAt,
        executeCount: target.yesterdayCount
      }
    }
    if (sourceScore > 0 && foregroundApp) {
      evidence.sourceApp = {
        bundleId: foregroundApp.bundleId,
        name: foregroundApp.name || foregroundApp.bundleId,
        executeCount: target.sourceCount,
        activeDays: target.sourceDays.size,
        totalExecutions: sourceExecutions,
        baselineExecuteCount: target.executeCount,
        baselineTotalExecutions: totalExecutions
      }
      if (
        target.jointCount >= FREQUENT_MIN_EXECUTES_30 &&
        target.jointDays.size >= FREQUENT_MIN_ACTIVE_DAYS_30
      ) {
        evidence.sourceApp.timeWindow = {
          startHour: (context.time.hourOfDay + 23) % 24,
          endHour: (context.time.hourOfDay + 1) % 24,
          executeCount: target.jointCount,
          activeDays: target.jointDays.size
        }
      }
    }
    candidates.push({
      sourceId: target.sourceId,
      itemId: target.itemId,
      sourceType: target.sourceType,
      score,
      source: sourceScore >= yesterdayScore && sourceScore > 0 ? 'app-context' : 'yesterday',
      evidence
    })
  }
  return candidates.sort((left, right) => right.score - left.score)
}
