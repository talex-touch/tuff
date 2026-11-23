import type { Ref } from 'vue'
import type { ModelChoice } from '~/modules/conversation/useModelOptions'
import type {
  ConversationMessage,
  ConversationTurnMeta
} from '~/modules/conversation/useHomeConversation'
import {
  estimateAiTranscriptTokens,
  useThinkingTicker
} from '@talex-touch/intelligence-uikit/utils'
import { contextOccupancyTokens } from '@talex-touch/pi-desktop-reuse/context-usage'
import { computed } from 'vue'
import { buildActivityTurns } from '~/modules/conversation/workspace-activity'
import { toHomeModelLimits } from '~/modules/conversation/workspace-panel'
import {
  contextPercent,
  deriveRunStep,
  formatWindow,
  lastReportedTurn
} from '../composer/run-status'

export interface UseHomeRunTelemetryOptions {
  messages: Ref<ConversationMessage[]>
  isStreaming: Ref<boolean>
  resolvedChoice: Ref<ModelChoice | null | undefined>
  locale: Ref<string>
}

/**
 * Derives live turn telemetry for Home's run dock, side panel, and message context: active step,
 * thinking ticker, activity turns, routed model limits, and context-window occupancy.
 */
export function useHomeRunTelemetry(options: UseHomeRunTelemetryOptions) {
  const activityTurns = computed(() => buildActivityTurns(options.messages.value))

  const modelLimits = computed(() => toHomeModelLimits(options.resolvedChoice.value?.binding))

  const streamingAssistant = computed(() => {
    const last = options.messages.value[options.messages.value.length - 1]
    return last?.role === 'assistant' && last.status === 'streaming' ? last : undefined
  })

  const runStartedAt = computed(() => streamingAssistant.value?.createdAt)

  const runStep = computed(() => deriveRunStep(streamingAssistant.value?.parts))

  const isThinkingActive = computed(() => {
    if (!options.isStreaming.value) return false
    const step = runStep.value
    return step.kind === 'waiting' || (step.kind === 'thinking' && !step.title)
  })

  const thinkingTicker = useThinkingTicker({
    active: isThinkingActive,
    locale: options.locale
  })

  const contextShare = computed(() => {
    const turn = lastReportedTurn(options.messages.value) as ConversationTurnMeta | undefined
    let occupancy = turn
      ? contextOccupancyTokens({
          inputTokens: turn.promptTokens ?? 0,
          outputTokens: turn.completionTokens ?? 0,
          totalTokens: turn.totalTokens ?? 0
        })
      : 0
    if (occupancy <= 0) {
      occupancy = estimateAiTranscriptTokens(options.messages.value)
    }
    return contextPercent(occupancy, modelLimits.value.contextWindow?.value ?? 128_000)
  })

  const contextWindowText = computed(() =>
    formatWindow(modelLimits.value.contextWindow?.value ?? 128_000)
  )

  return {
    activityTurns,
    modelLimits,
    streamingAssistant,
    runStartedAt,
    runStep,
    thinkingTicker,
    contextShare,
    contextWindowText
  }
}
