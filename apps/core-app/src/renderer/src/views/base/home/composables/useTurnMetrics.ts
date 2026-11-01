import type { ComputedRef } from 'vue'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { appSetting } from '~/modules/storage/app-storage'

/** How long a settled turn's footer stays on show before it rests (hover brings it back). */
const FOOTER_REVEAL_MS = 4500

export function formatMetricLatency(ms?: number): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatTokenCount(count: number): string {
  if (count < 1000) return `${count}`
  if (count < 10000) return `${(count / 1000).toFixed(1)}K`
  if (count < 1000000) return `${Math.round(count / 1000)}K`
  return `${(count / 1000000).toFixed(1)}M`
}

export function calculateTokenSpeed(message: ConversationMessage): number | null {
  const latency = message.meta?.latencyMs
  if (!latency || latency < 200) return null
  const tokens = message.meta?.completionTokens ?? message.meta?.totalTokens
  if (!tokens || tokens <= 0) return null
  const seconds = latency / 1000
  return Math.round(tokens / seconds)
}

export function metricTokensTitle(message: ConversationMessage): string {
  const meta = message.meta
  const prompt = meta?.promptTokens ?? 0
  const completion = meta?.completionTokens ?? 0
  const total = meta?.totalTokens ?? 0
  return `输入: ${prompt} · 输出: ${completion} · 总计: ${total}`
}

export function metricLatencyTitle(message: ConversationMessage): string {
  const meta = message.meta
  const latency = meta?.latencyMs ? formatMetricLatency(meta.latencyMs) : ''
  const ttft = meta?.ttftMs ? formatMetricLatency(meta.ttftMs) : ''
  if (ttft) {
    return `总耗时: ${latency} · 首字响应 (TTFT): ${ttft}`
  }
  return `耗时: ${latency}`
}

/**
 * A settled turn's footer — the actions and the run metrics. It shows itself for a few seconds when
 * a reply completes, then rests until hovered; and the metrics badges obey the settings switch.
 */
export function useTurnMetrics(messages: ComputedRef<ConversationMessage[]>) {
  const { t } = useI18n()

  const showTurnMetrics = computed(() => appSetting.conversation?.showTurnMetrics !== false)

  function metricCacheLabel(message: ConversationMessage): string {
    return t('home.workspace.activity.cache', {
      tokens: formatTokenCount(message.meta?.cacheReadTokens ?? 0)
    })
  }

  function metricCacheTitle(message: ConversationMessage): string {
    return t('home.workspace.activity.cacheTitle', { tokens: message.meta?.cacheReadTokens ?? 0 })
  }

  const activeFooterMessageIds = ref<Set<string>>(new Set())
  const footerTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function revealTurnFooter(messageId: string): void {
    activeFooterMessageIds.value.add(messageId)
    clearTimeout(footerTimers.get(messageId))
    const timer = setTimeout(() => {
      activeFooterMessageIds.value.delete(messageId)
      footerTimers.delete(messageId)
    }, FOOTER_REVEAL_MS)
    footerTimers.set(messageId, timer)
  }

  function isTurnFooterResting(message: ConversationMessage): boolean {
    return !activeFooterMessageIds.value.has(message.id)
  }

  watch(
    () => messages.value.map((m) => `${m.id}:${m.status}`).join(';'),
    (_current, previous) => {
      if (!previous) return
      const prevMap = new Map(previous.split(';').map((s) => s.split(':') as [string, string]))
      for (const msg of messages.value) {
        if (
          msg.role === 'assistant' &&
          msg.status === 'complete' &&
          prevMap.get(msg.id) !== 'complete'
        ) {
          revealTurnFooter(msg.id)
        }
      }
    }
  )

  onScopeDispose(() => {
    for (const timer of footerTimers.values()) clearTimeout(timer)
    footerTimers.clear()
  })

  return {
    showTurnMetrics,
    metricCacheLabel,
    metricCacheTitle,
    isTurnFooterResting
  }
}
